// src/bot/connection.ts
// Padrão baseado no exemplo canônico:
// https://github.com/PrismarineJS/mineflayer/blob/master/examples/reconnector.js
import mineflayer, { type Bot } from 'mineflayer'
import { pathfinder, Movements } from 'mineflayer-pathfinder'
import { config } from '../config'

export type BotReadyCallback = (bot: Bot) => void

/**
 * Cria uma instância de bot Mineflayer com reconexão automática.
 * CONN-01: conecta e permanece online.
 * CONN-02: ao cair, cria sessão de bot NOVA (não reutiliza a instância morta).
 *
 * @param onReady - Callback chamado após spawn bem-sucedido.
 *                  Recebe a instância de bot com pathfinder já carregado.
 */
export function createBot(onReady?: BotReadyCallback): void {
  const bot = mineflayer.createBot({
    host: config.host,
    port: config.port,
    username: config.username,
    version: config.mcVersion,  // D-03: '1.21.4' por padrão
    auth: 'offline',            // D-05: offline-mode para desenvolvimento local
  })

  bot.once('spawn', () => {
    // Carregar pathfinder após spawn (ACT-01 — usado pelo navigate skill no Plano 03)
    bot.loadPlugin(pathfinder)
    const movements = new Movements(bot)
    movements.canDig = true           // permite mineração durante navegação
    movements.allowSprinting = true   // sprinting é comportamento humano normal
    bot.pathfinder.setMovements(movements)

    // Em MC 1.21.x, bot.health/food chegam via pacote separado após spawn.
    // Aguardar 'health' garante que o snapshot capture valores reais.
    const onHealthReady = () => {
      console.log(
        `[MineMind] Online — ${config.host}:${config.port} | ` +
        `HP: ${bot.health} | Pos: ${Math.round(bot.entity.position.x)},` +
        `${Math.round(bot.entity.position.y)},${Math.round(bot.entity.position.z)}`
      )
      onReady?.(bot)
    }

    if (bot.health !== undefined) {
      onHealthReady()
    } else {
      bot.once('health', onHealthReady)
    }
  })

  bot.on('error', (err: Error) => {
    // Não recriar aqui — 'end' é sempre emitido após 'error'
    console.error(`[MineMind] Erro de conexão: ${err.message}`)
  })

  bot.on('kicked', (reason: string) => {
    console.warn(`[MineMind] Kicked pelo servidor: ${reason}`)
  })

  // CONN-02: reconexão automática — listener registrado DENTRO do escopo de createBot()
  // para garantir que seja GC'd junto com a instância morta (evita memory leak, PITFALL 3)
  bot.on('end', (reason: string) => {
    console.log(
      `[MineMind] Desconectado: "${reason}". ` +
      `Reconectando em ${config.reconnectDelayMs / 1000}s...`
    )
    // Cria instância NOVA — não reutiliza 'bot' (referência sai de escopo após 'end')
    setTimeout(() => createBot(onReady), config.reconnectDelayMs)
  })
}
