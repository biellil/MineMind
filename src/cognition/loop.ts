// src/cognition/loop.ts
// COG-01 / D-01 / D-02: driver externo single-flight. A "aresta de retorno" = re-invocar o grafo por tick.
// Fase 3 (CONN-03/D-20): recebe o holder por parâmetro (criado 1x em bot/index.ts) — control/safety/memory
// vivem nele e sobrevivem à reconexão. COG-03/D-19: a cada tick dispara maybeDeliberate SEM bloquear o tick.
import type { Bot } from 'mineflayer'
import { config } from '../config'
import { buildGraph } from './graph'
import { parseCommand } from '../control/commands'
import { parseDisposition } from '../control/disposition'
import { shouldRespond, handleConversation } from '../chat/conversation'
import type { CognitiveStateHolder } from './state'
import { createDeliberator, type DeliberationTrigger } from './deliberation'
import { createProvider } from '../llm/provider'
import { urgency } from '../motivation/needs'
import { motivationConfigFor } from '../config'
import type { WorldSnapshot } from '../perception/types'
import { shouldReflect, type ReflectionState } from './reflection'
import { importanceOf } from '../memory/longTerm'
import { getEvents } from '../memory/shortTerm'
import { persistHolder } from '../memory/holder.persistence'

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Inicia o loop cognitivo para UMA sessão de bot. Para automaticamente quando a sessão termina.
 * Chamar em onBotReady (1x por sessão). A reconexão chama de novo com bot novo MAS o MESMO holder
 * (CONN-03/D-20) — a mente (needs/goals/memory) não reinicia.
 */
export function startCognitiveLoop(bot: Bot, holder: CognitiveStateHolder): void {
  // provider + deliberator: baratos, 1x por sessão. createProvider seleciona local/cloud por env
  // (D-13) e, no caminho cloud, envolve o teto de custo persistido em holder.db (D-06/D-09). O
  // provider degrada graciosamente se o LLM estiver off (D-17) e cai para o local ao estourar o teto.
  const provider = createProvider({ db: holder.db })
  const deliberator = createDeliberator()
  // CR#3: desestrutura o checkpointer para podá-lo periodicamente (deleteThread) — sem poda, o
  // MemorySaver acumula 1 checkpoint por super-step sob o thread_id fixo e a RAM cresce sem limite.
  const { graph, checkpointer } = buildGraph({ bot, holder, provider })

  // UM ÚNICO handler de chat por sessão (Pattern 5 / Pitfall 6 — handler morre com a sessão).
  // Ordem ESTRITA, tudo literal/sem-LLM exceto o passo 3:
  //   1) controle literal (!auto/!livre/!pausar/... — D-09/D-14) -> muda modo
  //   2) disposição literal (!ajudante/!sozinho — D-05) -> muda disposição em runtime
  //   3) conversa (CHAT-01/02) — SÓ se permitido (AUTONOMOUS mínimo, D-07); void (não bloqueia).
  // Comandos literais são imunes a prompt injection: lookup exato, parseados ANTES da conversa.
  bot.on('chat', (username: string, message: string) => {
    if (username === bot.username) return // Pitfall 5: ignora a si mesmo
    const mode = parseCommand(message) // 1) controle literal (D-09/D-14)
    if (mode) {
      holder.control.setMode(mode)
      return
    }
    const disp = parseDisposition(message) // 2) disposição literal (D-05)
    if (disp) {
      holder.disposition = disp
      return
    }
    // 3) conversa — única chamada com LLM; não bloqueia o tick reativo (void).
    if (shouldRespond(holder.disposition, config.proactivity, username, bot.username)) {
      void handleConversation(provider, holder, bot, username, message, Date.now())
    }
  })

  // stop-on-disconnect: a sessão morre -> o while termina. B2: ANTES de parar, faz flush da mente
  // ao disco — bot.once('end') (desconexão/crash de sessão) só pararia o loop, perdendo todo o
  // estado vivo desde o boot se a reflexão (que também faz flush) nunca tivesse rodado.
  let alive = true
  bot.once('end', () => {
    alive = false
    try {
      if (holder.db) {
        persistHolder(holder.db, holder, Date.now())
        console.log('[loop] mente persistida ao encerrar a sessão (bot end)')
      }
    } catch (err) {
      // flush no shutdown NUNCA deve lançar (D-02): apenas registra.
      console.error('[loop] flush no end falhou:', err instanceof Error ? err.message : err)
    }
  })

  // CR#2: na morte/void o Mineflayer zera bot.entity e NÃO emite 'end' — o loop não pode travar.
  // O Mineflayer normalmente respawna sozinho; estes handlers são informativos. A percepção já é
  // defensiva (Task 1/2), então NÃO chamamos buildWorldSnapshot aqui. A parada graciosa quando o
  // corpo não volta é feita no while por deadTicks (abaixo).
  bot.on('death', () => console.log('[loop] bot morreu — aguardando respawn'))
  bot.on('respawn', () => console.log('[loop] respawn'))

  const cfg = { configurable: { thread_id: 'minemind-agent' } }
  let lastSnapshot: WorldSnapshot | null = null

  // REFL-01/D-10: estado do gatilho de reflexão por sessão. `seenEvents` rastreia quantos eventos
  // da memória de curto prazo já foram contabilizados, para somar só a importância dos NOVOS.
  const reflState: ReflectionState = { lastReflectionAt: -Infinity, importanceAccum: 0 }
  let seenEvents = getEvents(holder.memory).length

  // B2: flush periódico — limita a janela de perda em um crash duro (OOM/kill -9) a no máximo
  // config.holderFlushIntervalMs. Independe da reflexão (que pode demorar a disparar) e do signal.
  let lastFlushAt = -Infinity

  // CR#2: contador de ticks consecutivos SEM corpo (snapshot null = morte/void). Ao cruzar
  // config.deathStopTicks o while encerra graciosamente (morte/void não emitem 'end').
  let deadTicks = 0
  // CR#3: timestamp da última poda do checkpointer (deleteThread do thread fixo).
  let lastPruneAt = -Infinity

  // driver assíncrono — não bloqueia onBotReady
  void (async () => {
    console.log(`[loop] iniciado (disposição=${holder.disposition})`)
    while (alive) {
      const started = Date.now()
      try {
        const result = (await graph.invoke({}, cfg)) as { snapshot?: WorldSnapshot | null }
        lastSnapshot = result.snapshot ?? lastSnapshot

        // CR#2: rastreia ticks consecutivos sem corpo (snapshot null = morte/void). Se o bot ficar
        // sem corpo por config.deathStopTicks ticks (respawn não veio), encerra o while em vez de
        // girar em falso para sempre — morte/void NÃO emitem 'end'. Flush defensivo antes do break,
        // espelhando o handler de 'end'.
        if (!result.snapshot) {
          deadTicks++
          if (deadTicks >= config.deathStopTicks) {
            console.warn(
              `[loop] bot sem corpo por ${deadTicks} ticks — encerrando o loop para não girar em falso`,
            )
            try {
              if (holder.db) {
                persistHolder(holder.db, holder, Date.now())
                console.log('[loop] mente persistida ao encerrar por morte/void')
              }
            } catch (err) {
              console.error('[loop] flush no break por morte falhou:', err instanceof Error ? err.message : err)
            }
            break
          }
        } else {
          deadTicks = 0
        }

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

          // REFL-01/D-10: acumula a importância dos eventos NOVOS deste tick (ring buffer pode
          // ter evictado os antigos, então só contamos a cauda além do que já vimos).
          const events = getEvents(holder.memory)
          if (events.length > seenEvents) {
            for (const e of events.slice(seenEvents)) reflState.importanceAccum += importanceOf(e)
          }
          seenEvents = events.length

          // Gatilho híbrido de reflexão (D-10): event-driven / acúmulo / piso temporal. Dispara via
          // a deliberação single-flight com trigger 'reflect' (não bloqueia o tick; o lock inFlight
          // garante que reflexão não sobrepõe ação).
          const reflectNow = Date.now()
          if (
            shouldReflect({
              enteredIdle: false, // heurística: sem sinal de transição do grafo; cobre-se por acúmulo/piso
              goalDoneOrFailed: holder.currentGoal == null,
              importanceAccum: reflState.importanceAccum,
              lastReflectionAt: reflState.lastReflectionAt,
              now: reflectNow,
            })
          ) {
            // B1: NÃO rearmar o gatilho aqui. A reflexão pode no-op (uma ação está in-flight —
            // D-12). Se zerássemos lastReflectionAt/importanceAccum incondicionalmente, o piso/
            // acúmulo se auto-desarmaria e a reflexão NUNCA rodaria. Só rearmamos quando a
            // reflexão DE FATO executou (ran === true); caso contrário o gatilho persiste e tenta
            // de novo num tick posterior (na janela livre de inFlight entre ações).
            void deliberator
              .maybeDeliberate(deliberator.state, holder, provider, lastSnapshot, 'reflect', reflectNow)
              .then((ran) => {
                if (ran) {
                  reflState.lastReflectionAt = reflectNow
                  reflState.importanceAccum = 0
                  console.log('[reflect] reflexão executada')
                }
              })
          }
        }

        // B2: flush periódico da mente — bound na perda por crash duro (OOM). Independe de
        // reflexão/signal. Guardado em holder.db (no-op gracioso quando ausente).
        const flushNow = Date.now()
        if (holder.db && flushNow - lastFlushAt >= config.holderFlushIntervalMs) {
          try {
            persistHolder(holder.db, holder, flushNow)
            lastFlushAt = flushNow
          } catch (err) {
            console.error('[loop] flush periódico falhou:', err instanceof Error ? err.message : err)
          }
        }

        // CR#3: poda periódica do checkpointer. O thread_id é fixo ('minemind-agent'), então o
        // MemorySaver acumula 1 checkpoint por super-step sem podar e a RAM sobe continuamente.
        // deleteThread limpa o histórico do thread. A continuidade entre ticks vive no holder
        // (fonte única), não no checkpointer — podar é seguro: o próximo invoke recria o estado
        // inicial e observe re-semeia do holder.
        const pruneNow = Date.now()
        if (config.checkpointPruneIntervalMs > 0 && pruneNow - lastPruneAt >= config.checkpointPruneIntervalMs) {
          try {
            await checkpointer.deleteThread('minemind-agent')
            lastPruneAt = pruneNow
          } catch (err) {
            console.error('[loop] poda do checkpointer falhou:', err instanceof Error ? err.message : err)
          }
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

/**
 * Escolhe o gatilho de deliberação com base no outcome do SkillResult (D-07/D-08):
 * - no_effect/partial: ação mecânica sem progresso real → escalona ao LLM imediatamente.
 * - need_threshold: urgência cruzou limiar de necessidade → re-deliberação prioritária.
 * - periodic: fallback (tudo estável, nenhum sinal de escalada).
 *
 * pickTrigger apenas classifica — quem chama maybeDeliberate é o loop;
 * o deliberator usa inFlight para single-flight (D-08: NUNCA await o LLM aqui).
 */
function pickTrigger(holder: CognitiveStateHolder): DeliberationTrigger {
  const mcfg = motivationConfigFor(holder.disposition)
  const t = Date.now()

  // D-07: outcome do SkillResult (Fase 7) como gatilho primário de re-deliberação.
  // no_effect/partial após um passo mecânico indica "tentativa sem progresso real" → LLM decide.
  const lastOutcome = holder.lastObservedDelta?.outcome
  if (lastOutcome === 'no_effect' || lastOutcome === 'partial') {
    return 'need_threshold' // mais urgente que 'periodic' — força re-deliberação mais cedo
  }

  // D-08: necessidade cruzou limiar → disparo por need_threshold.
  const crossed = holder.needs.some((n) => urgency(n, t, mcfg) >= mcfg.goalThreshold)
  return crossed ? 'need_threshold' : 'periodic'
}
