// src/cognition/loop.ts
// COG-01 / D-01 / D-02: driver externo single-flight. A "aresta de retorno" = re-invocar o grafo por tick.
// Fase 3 (CONN-03/D-20): recebe o holder por parâmetro (criado 1x em bot/index.ts) — control/safety/memory
// vivem nele e sobrevivem à reconexão. COG-03/D-19: a cada tick dispara maybeDeliberate SEM bloquear o tick.
import type { Bot } from 'mineflayer'
import { config } from '../config'
import { buildGraph } from './graph'
import { registerChatCommands } from '../control/commands'
import type { CognitiveStateHolder } from './state'
import { createDeliberator, type DeliberationTrigger } from './deliberation'
import { createLmStudioProvider } from '../llm/provider'
import { urgency } from '../motivation/needs'
import { motivationConfigFor } from '../config'
import type { WorldSnapshot } from '../perception/types'

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Inicia o loop cognitivo para UMA sessão de bot. Para automaticamente quando a sessão termina.
 * Chamar em onBotReady (1x por sessão). A reconexão chama de novo com bot novo MAS o MESMO holder
 * (CONN-03/D-20) — a mente (needs/goals/memory) não reinicia.
 */
export function startCognitiveLoop(bot: Bot, holder: CognitiveStateHolder): void {
  // provider + deliberator: baratos, 1x por sessão. O provider degrada graciosamente se o LLM estiver off (D-17).
  const provider = createLmStudioProvider()
  const deliberator = createDeliberator()
  const graph = buildGraph({ bot, holder, provider })

  // parser de comando literal de chat (D-09) — registrado 1x por sessão (handler morre com a sessão).
  // Usa o control do holder (durável). O caminho conversacional/disposição entra no Plan 04.
  registerChatCommands(bot, holder.control)

  // stop-on-disconnect: a sessão morre -> o while termina
  let alive = true
  bot.once('end', () => {
    alive = false
  })

  const cfg = { configurable: { thread_id: 'minemind-agent' } }
  let lastSnapshot: WorldSnapshot | null = null

  // driver assíncrono — não bloqueia onBotReady
  void (async () => {
    console.log(`[loop] iniciado (disposição=${holder.disposition})`)
    while (alive) {
      const started = Date.now()
      try {
        const result = (await graph.invoke({}, cfg)) as { snapshot?: WorldSnapshot | null }
        lastSnapshot = result.snapshot ?? lastSnapshot

        // COG-03/D-19: dispara a deliberação LLM lenta SEM bloquear o tick (Pattern 3/Pitfall 3).
        if (lastSnapshot) {
          const trigger = pickTrigger(holder)
          void deliberator.maybeDeliberate(
            deliberator.state,
            holder,
            provider,
            lastSnapshot,
            trigger,
            Date.now(),
          )
        }
      } catch (err) {
        console.error('[loop] erro no tick:', err instanceof Error ? err.message : err)
      }
      const elapsed = Date.now() - started
      if (elapsed < config.minTickMs) await sleep(config.minTickMs - elapsed) // D-02 intervalo mínimo
    }
    console.log('[loop] encerrado (sessão terminou)')
  })()
}

/** Escolhe um gatilho simples: 'need_threshold' se alguma urgência cruza o limiar, senão 'periodic'. */
function pickTrigger(holder: CognitiveStateHolder): DeliberationTrigger {
  const mcfg = motivationConfigFor(holder.disposition)
  const t = Date.now()
  const crossed = holder.needs.some((n) => urgency(n, t, mcfg) >= mcfg.goalThreshold)
  return crossed ? 'need_threshold' : 'periodic'
}
