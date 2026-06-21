// src/cognition/loop.ts
// COG-01 / D-01 / D-02: driver externo single-flight. A "aresta de retorno" = re-invocar o grafo por tick.
// Fase 3 (CONN-03/D-20): recebe o holder por parâmetro (criado 1x em bot/index.ts) — control/safety/memory
// vivem nele e sobrevivem à reconexão. COG-03/D-19: a cada tick dispara maybeDeliberate SEM bloquear o tick.
// Fase 07.1 Plan 03: driver event-driven — sleep fixo substituído por makeParkPromise + Promise.race;
// TriggerBus instanciado por sessão; heartbeat (flush, prune) em setInterval autônomos (D-05/D-11).
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
import { recordEvent } from '../memory/recordEvent'
import { persistHolder } from '../memory/holder.persistence'
import { TriggerBus } from './trigger-bus'
import type { TriggerConfig } from './trigger-bus'
import { arbitrateReflex, type ReflexSensors, type ReflexDecision } from './reflex'
import { skillRegistry } from '../skills/index'

// ── makeParkPromise ────────────────────────────────────────────────────────────
// Fase 07.1 Plan 03 (D-01/D-09/D-11):
// Estaciona o driver até um dos três eventos:
//   - 'actionFinished': nó execute emitiu — próximo passo está pronto (acorda imediatamente)
//   - 'abort': bot.end/desconexão — sessão encerrada (acorda e sai do while)
//   - timeout: rede de segurança — idle genuíno ou stall (acorda e verifica o estado)
//
// NUNCA usar minTickMs aqui — o timeout-piso é SALVAGUARDA, não motor do loop (D-09).
// D-11: cleanup obrigatório remove TODOS os listeners e clearTimeout ao acordar (sem leak).
type WakeReason = 'actionFinished' | 'timeout' | 'abort'

function makeParkPromise(
  triggerBus: TriggerBus,
  abortSignal: AbortSignal,
  nextWakeMs: number,
): Promise<WakeReason> {
  return new Promise<WakeReason>((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined

    const onActionFinished = () => { cleanup(); resolve('actionFinished') }
    const onAbort = () => { cleanup(); resolve('abort') }

    timer = setTimeout(() => { cleanup(); resolve('timeout') }, nextWakeMs)
    triggerBus.once('actionFinished', onActionFinished)
    abortSignal.addEventListener('abort', onAbort, { once: true })

    function cleanup() {
      clearTimeout(timer)
      triggerBus.off('actionFinished', onActionFinished)
      // abortSignal.addEventListener com { once: true } se auto-remove — não precisa removeEventListener
    }
  })
}

// ── System 1 idle (Fase 8 / D-02/D-18/D-19) ─────────────────────────────────────
// O System 1 vive FORA do StateGraph (D-01). A arbitragem (arbitrateReflex) é a função PURA;
// a COLETA de sensores pode ler o bot diretamente (o driver não é puro). Aqui só rodam os
// reflexos lifeCritical=false (eat/shelter) quando o bot está ocioso — NUNCA interrompem a
// deliberação nem tocam o LLM/inFlight. lifeCritical=true já preempta no nó execute (Task 2).

/**
 * Mapeia o reflexo vencedor (arbitrateReflex) → nome da skill no skillRegistry.
 * `defend` (encurralado de dia) usa a skill `attack`; `retreatEnv` (lava/queda) não tem skill —
 * a preempção no execute + a re-percepção resolvem (undefined ⇒ o driver não despacha nada).
 */
const REFLEX_SKILL: Record<ReflexDecision['reflex'], string | undefined> = {
  eat: 'eat',
  flee: 'flee',
  shelter: 'shelter',
  defend: 'attack',
  retreatEnv: undefined,
}

/** Monta o snapshot de sensores reflexos lendo o bot diretamente (null-safe). */
function buildReflexSensors(bot: Bot): ReflexSensors {
  const e = bot.entity
  const hostile = e ? bot.nearestEntity((x) => (x as unknown as Record<string, string>).kind === 'Hostile mobs') : null
  return {
    food: bot.food ?? 20,
    health: bot.health ?? 20,
    oxygen: bot.oxygenLevel ?? 20,
    isNight: bot.time ? bot.time.timeOfDay >= 13000 : false,
    nearestHostile: hostile && e
      ? {
          kind: (hostile as unknown as Record<string, string>).kind ?? '',
          name: hostile.name ?? '',
          distance: e.position.distanceTo(hostile.position),
        }
      : null,
    // lavaAhead/fallAhead já preemptam no execute (Task 2 via physicsTick); aqui são só p/ eat/shelter idle.
    lavaAhead: false,
    fallAhead: 0,
    // predicado simples (D-16): default false → foge por padrão; pode ser refinado.
    cornered: false,
  }
}

/**
 * Despacha uma skill reflexa idle pelo skillRegistry e registra um MemEvent grounded DEBOUNCED
 * (D-19 — não inunda a memória com re-triggers). NUNCA chama o LLM nem toca inFlight (Pitfall 4 /
 * D-18) — preserva o [reflect]. `lastReflexAt` é o estado de debounce por tipo de reflexo (sessão).
 */
async function runReflex(
  bot: Bot,
  holder: CognitiveStateHolder,
  reflex: string,
  lastReflexAt: Record<string, number>,
): Promise<void> {
  const skill = skillRegistry[reflex]
  if (!skill) return
  try {
    // sem signal — um reflexo idle não é preemptado por si mesmo (lifeCritical=true vai pelo execute).
    const result = await skill(bot, {})
    // D-19: MemEvent grounded debounced/coalesced (janela mínima de 3s por tipo de reflexo).
    const nowTs = Date.now()
    if (nowTs - (lastReflexAt[reflex] ?? 0) > 3000) {
      lastReflexAt[reflex] = nowTs
      recordEvent(holder, {
        type: 'action',
        skill: reflex,
        target: 'reflex',
        outcome: result.outcome,
        observed: result.observed,
        expected: result.expected,
        result: result.outcome === 'success' ? 'success' : 'failure',
        reason: result.reason,
        timestamp: nowTs,
      }, nowTs)
      console.log(`[reflex] ${reflex} ${result.outcome} (${result.observed}/${result.expected})`)
    }
  } catch (err) {
    console.error(`[reflex] ${reflex} falhou:`, err instanceof Error ? err.message : err)
  }
}

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

  // Fase 07.1 Plan 03: TriggerBus instanciado POR SESSÃO (D-12) — emite actionFinished, nightFell,
  // dayBroke, hostileNearby, stuck, hungry. O nó execute emite actionFinished diretamente via emit().
  // Cleanup obrigatório no bot.once('end') — evita listener leak (T-07.1-04 / D-11).
  const triggerBus = new TriggerBus()
  const triggerCfg: TriggerConfig = {
    hostileRadius: config.hostileRadius,
    hostileDebounceMs: config.hostileDebounceMs,
    hungryThreshold: config.hungryThreshold,
    // Fase 8: limiares dos gatilhos lifeCritical (physicsTick edge-detection, D-09/D-14)
    healthCriticalThreshold: config.healthCriticalThreshold,
    healthExitThreshold: config.healthExitThreshold,
    oxygenEmergeThreshold: config.oxygenEmergeThreshold,
    oxygenExitThreshold: config.oxygenExitThreshold,
    fallDangerBlocks: config.fallDangerBlocks,
    lavaLookahead: config.lavaLookahead,
  }
  const cleanupTriggerBus = triggerBus.setupMineflayerListeners(bot, triggerCfg)

  // CR#3: desestrutura o checkpointer para podá-lo periodicamente (deleteThread) — sem poda, o
  // MemorySaver acumula 1 checkpoint por super-step sob o thread_id fixo e a RAM cresce sem limite.
  // Fase 07.1 Plan 03: buildGraph agora recebe triggerBus (passado para os nós via NodeDeps).
  const { graph, checkpointer } = buildGraph({ bot, holder, provider, triggerBus })

  // Fase 07.1 Plan 03: AbortController de sessão — bot.end resolve o race sem deadlock (D-11/T-07.1-11).
  const sessionAbort = new AbortController()

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
    // Fase 07.1 Plan 03: encerra o race sem deadlock (D-11/T-07.1-11)
    sessionAbort.abort()
    // Fase 07.1 Plan 03: remove listeners do TriggerBus (T-07.1-04/D-11)
    cleanupTriggerBus()
    // Fase 07.1 Plan 03: limpa os timers autônomos (D-05/D-11)
    clearInterval(flushTimer)
    clearInterval(pruneTimer)
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

  // Fase 8 (D-19): estado de debounce do System 1 idle por tipo de reflexo (escopo de sessão).
  const lastReflexAt: Record<string, number> = {}

  // CR#2: contador de ticks consecutivos SEM corpo (snapshot null = morte/void). Ao cruzar
  // config.deathStopTicks o while encerra graciosamente (morte/void não emitem 'end').
  let deadTicks = 0

  // Fase 07.1 Plan 03 (D-05/D-11): timers autônomos de heartbeat — independem do ritmo do tick.
  // Declarados ANTES de bot.once('end') para que o handler possa fazer clearInterval neles.
  // Declarados como variáveis capturadas pela closure do bot.once('end').
  let flushTimer: ReturnType<typeof setInterval> | undefined
  let pruneTimer: ReturnType<typeof setInterval> | undefined

  // D-05: heartbeat autônomo de flush periódico (independe do ritmo do tick)
  if (config.holderFlushIntervalMs > 0) {
    flushTimer = setInterval(() => {
      if (!holder.db) return
      try {
        persistHolder(holder.db, holder, Date.now())
      } catch (err) {
        console.error('[loop] flush periódico falhou:', err instanceof Error ? err.message : err)
      }
    }, config.holderFlushIntervalMs)
  }

  // D-05: heartbeat autônomo de poda do checkpointer (independe do ritmo do tick)
  if (config.checkpointPruneIntervalMs > 0) {
    pruneTimer = setInterval(async () => {
      try {
        await checkpointer.deleteThread('minemind-agent')
      } catch (err) {
        console.error('[loop] poda do checkpointer falhou:', err instanceof Error ? err.message : err)
      }
    }, config.checkpointPruneIntervalMs)
  }

  // Fase 07.1 Plan 03: nextWakeMs inicial = timeout-piso de navegação (antes de qualquer sinal do grafo)
  let nextWakeMs = config.navigateTimeoutMs

  // driver assíncrono — não bloqueia onBotReady
  void (async () => {
    console.log(`[loop] iniciado (disposição=${holder.disposition})`)
    while (alive) {
      try {
        const result = (await graph.invoke({}, cfg)) as {
          snapshot?: WorldSnapshot | null
          enteredIdle?: boolean
          nextWakeMs?: number
        }
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
          // Fase 07.1 Plan 03: enteredIdle lido do sinal REAL do grafo (D-10 — corrige hardcoded false).
          const enteredIdle = result.enteredIdle === true
          if (
            shouldReflect({
              enteredIdle,
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

        // Fase 07.1 Plan 03: atualiza nextWakeMs com o sinal do grafo (D-10).
        // enteredIdle=true → park longo (idleWakeIntervalMs); senão → timeout-piso de navegação.
        // O nó observe já calcula este valor — apenas lemos do resultado do grafo.
        nextWakeMs = result.nextWakeMs ?? config.navigateTimeoutMs

        // Fase 07.1 Plan 03 (D-01/D-09): estaciona até actionFinished, abort, ou timeout-piso.
        // 'actionFinished' → próximo tick imediatamente (cadeia agêntica).
        // 'abort' → bot.end — encerra o while.
        // 'timeout' → rede de segurança (idle genuíno ou stall) → próximo tick.
        const wakeReason = await makeParkPromise(triggerBus, sessionAbort.signal, nextWakeMs)
        if (wakeReason === 'abort') break
        // 'actionFinished' ou 'timeout' → continua o while imediatamente

        // Fase 8 (D-02/D-18): System 1 — despacha o reflexo VENCEDOR após o park (idle OU logo após
        // uma preempção lifeCritical no execute ter abortado a ação). Os gatilhos lifeCritical=true
        // (hostileNearby/...) preemptam a ação em curso no nó execute (Task 2, setGoal(null) imediato);
        // AQUI o driver de fato EXECUTA a resposta (fugir/atacar/comer/abrigar). Sem este dispatch o
        // bot só PARAVA perto do mob e esperava o LLM lento decidir — e morria (validado ao vivo).
        // retreatEnv (lava/queda) não tem skill: o abort no execute + re-percepção bastam.
        // runReflex NUNCA toca o LLM/inFlight (Pitfall 4 / D-18); ao terminar, o while re-percebe.
        if (alive && bot.entity) {
          const decision = arbitrateReflex(buildReflexSensors(bot))
          const skillName = decision ? REFLEX_SKILL[decision.reflex] : undefined
          if (skillName) {
            await runReflex(bot, holder, skillName, lastReflexAt)
          }
        }

      } catch (err) {
        console.error('[loop] erro no tick:', err instanceof Error ? err.message : err)
      }
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
