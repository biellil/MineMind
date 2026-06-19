// src/cognition/loop.ts
// COG-01 / D-01 / D-02: driver externo single-flight. A "aresta de retorno" = re-invocar o grafo por tick.
import type { Bot } from 'mineflayer'
import { config } from '../config'
import { buildGraph } from './graph'
import { createControlState, registerChatCommands } from '../control/commands'
import { createSafetyState } from './safety'

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Inicia o loop cognitivo para UMA sessao de bot. Para automaticamente quando a sessao termina.
 * Chamar em onBotReady (1x por sessao). Cada reconexao chama de novo com bot novo (D-03 estado do zero).
 */
export function startCognitiveLoop(bot: Bot): void {
  const control = createControlState('autonomous')
  const safety = createSafetyState()
  const graph = buildGraph({ bot, control, safety })

  // parser de comando literal de chat (D-09) — registrado 1x por sessao (handler morre com a sessao)
  registerChatCommands(bot, control)

  // stop-on-disconnect (Open Question 1): a sessao morre -> o while termina
  let alive = true
  bot.once('end', () => {
    alive = false
  })

  const cfg = { configurable: { thread_id: 'minemind-agent' } }

  // driver assincrono — nao bloqueia onBotReady
  void (async () => {
    console.log('[loop] iniciado (modo autonomo)')
    while (alive) {
      const started = Date.now()
      try {
        await graph.invoke({}, cfg) // input vazio: MemorySaver+thread_id carregam o estado do tick anterior
      } catch (err) {
        console.error('[loop] erro no tick:', err instanceof Error ? err.message : err)
      }
      const elapsed = Date.now() - started
      if (elapsed < config.minTickMs) await sleep(config.minTickMs - elapsed) // D-02 intervalo minimo
    }
    console.log('[loop] encerrado (sessao terminou)')
  })()
}
