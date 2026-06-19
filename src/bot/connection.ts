// src/bot/connection.ts
// Padrão baseado no exemplo canônico:
// https://github.com/PrismarineJS/mineflayer/blob/master/examples/reconnector.js
import mineflayer, { type Bot } from 'mineflayer'
import { pathfinder, Movements } from 'mineflayer-pathfinder'
import { plugin as collectBlock } from 'mineflayer-collectblock'
import { config } from '../config'

export type BotReadyCallback = (bot: Bot) => void

// Falhas de reconexão CONSECUTIVAS (sem spawn). Zera a cada spawn bem-sucedido.
// Limita o loop de reconexão que vaza memória quando o servidor está fora do ar.
let consecutiveFailures = 0

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
    // Carregar collectblock — usado pelo dig skill (ACT-02) no estado Gathering.
    // O import em dig.ts é só augmentação de tipos; o plugin precisa ser registrado em runtime.
    bot.loadPlugin(collectBlock)
    const movements = new Movements(bot)
    movements.canDig = true           // permite mineração durante navegação
    movements.allowSprinting = true   // sprinting é comportamento humano normal
    bot.pathfinder.setMovements(movements)

    // 999.1 D-02/D-03: bounds do A* — raiz do fix de OOM.
    // searchRadius = -1 (default) desativa o gate maxCost do A* → heap cresce sem teto em alvos
    // distantes. Setar searchRadius reativa o gate. thinkTimeout é a rede temporal secundária.
    // Aplicar em DOIS lugares: (1) os globais bot.pathfinder.* usados por todo pathfinding;
    // (2) bot.collectBlock.movements — instância que o collectBlock RECRIA internamente e que
    //     IGNORA o Movements passado a setMovements acima.
    // Os tipos do mineflayer-pathfinder não expõem searchRadius/thinkTimeout no Pathfinder/Movements,
    // mas as propriedades existem em runtime (são as levers reais do A*). @ts-expect-error pontual.
    // @ts-expect-error searchRadius existe em runtime no Pathfinder (não tipado)
    bot.pathfinder.searchRadius = config.pathfinderSearchRadius
    bot.pathfinder.thinkTimeout = config.pathfinderThinkTimeoutMs
    // Aplicar os mesmos bounds + flags de navegação ao Movements do collectBlock.
    // @ts-expect-error searchRadius existe em runtime no Movements (não tipado)
    movements.searchRadius = config.pathfinderSearchRadius
    // @ts-expect-error thinkTimeout existe em runtime no Movements (não tipado)
    movements.thinkTimeout = config.pathfinderThinkTimeoutMs
    if (bot.collectBlock?.movements) {
      // @ts-expect-error searchRadius existe em runtime no Movements (não tipado)
      bot.collectBlock.movements.searchRadius = config.pathfinderSearchRadius
      // @ts-expect-error thinkTimeout existe em runtime no Movements (não tipado)
      bot.collectBlock.movements.thinkTimeout = config.pathfinderThinkTimeoutMs
      bot.collectBlock.movements.canDig = true
      bot.collectBlock.movements.allowSprinting = true
    }

    // Em MC 1.21.x, bot.health/food chegam via pacote separado após spawn.
    // Aguardar 'health' garante que o snapshot capture valores reais.
    const onHealthReady = () => {
      consecutiveFailures = 0 // conexão estabelecida — zera o contador de falhas
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
    consecutiveFailures++
    // Cap de reconexão: para após N falhas CONSECUTIVAS (servidor provavelmente fora do ar).
    // Sem isso, o loop reconecta a cada 5s pra sempre e cada createBot recarrega o minecraft-data
    // → vazamento de memória ilimitado (chegou a ~24 GB com o servidor fechado).
    if (consecutiveFailures > config.maxReconnectAttempts) {
      console.error(
        `[MineMind] Falha ao conectar após ${config.maxReconnectAttempts} tentativas consecutivas. ` +
        `O servidor em ${config.host}:${config.port} parece estar fora do ar. Reconexão encerrada — ` +
        `rode 'bun start' de novo quando o servidor estiver no ar.`
      )
      return
    }
    console.log(
      `[MineMind] Desconectado: "${reason}". ` +
      `Reconectando em ${config.reconnectDelayMs / 1000}s ` +
      `(tentativa ${consecutiveFailures}/${config.maxReconnectAttempts})...`
    )
    // Cria instância NOVA — não reutiliza 'bot' (referência sai de escopo após 'end')
    setTimeout(() => createBot(onReady), config.reconnectDelayMs)
  })
}
