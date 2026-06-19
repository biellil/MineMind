// src/cognition/nodes.ts
// Nós do StateGraph. Fase 2: bot/control/safety por closure (Pitfall 3), sem LLM no tick.
// Fase 3 (CONN-03/D-20): control/safety/memory vêm do holder (fonte única). observe roda a
// motivação (evaluateNeeds/generateGoals/selectGoal) com pesos POR DISPOSIÇÃO (motivationConfigFor,
// D-06/D-10). analyze prefere a decisão LLM FRESCA do holder; senão degrada ao arbiter (D-17).
import type { Bot } from 'mineflayer'
import type { WorldSnapshot } from '../perception/types'
import { buildWorldSnapshot } from '../perception/snapshot'
import { skillRegistry } from '../skills/index'
import { config, motivationConfigFor } from '../config'
import type { CognitiveState } from './types'
import type { ShortTermMemory } from '../memory/shortTerm'
import { push } from '../memory/shortTerm'
import type { CognitiveStateHolder } from './state'
import type { LlmProvider } from '../llm/provider'
import type { ActionDecision } from '../llm/schemas'
import type { Disposition, Goal, Need } from '../motivation/types'
import { evaluateNeeds, urgency } from '../motivation/needs'
import { generateGoals, selectGoal } from '../motivation/goals'
import { arbitrate, highestPriorityGatherTarget } from './arbiter'
import {
  recordAttempt,
  shouldAbandon,
  recordFailure,
  recordSuccess,
  shouldFallbackToIdle,
  cooledDownTargets,
} from './safety'

/** Estado anotado do loop. Carrega apenas dados puros — NUNCA o bot. */
export interface LoopState {
  snapshot: WorldSnapshot | null
  cogState: CognitiveState
  memory: ShortTermMemory
  needs: Need[]
  goals: Goal[]
  currentGoal: Goal | null
  disposition: Disposition
}

export interface NodeDeps {
  bot: Bot
  holder: CognitiveStateHolder
  provider: LlmProvider
}

const now = () => Date.now()
const log = (msg: string) => console.log(`[loop] ${msg}`)

/** Mapeia a ação do enum LLM (fechado) para um CognitiveState da Fase 2. */
function actionToCognitiveState(action: ActionDecision['action']): CognitiveState {
  switch (action) {
    case 'gather':
      return 'gathering'
    case 'explore':
    case 'navigate':
      return 'exploring'
    case 'chat':
      return 'socializing'
    case 'idle':
    default:
      return 'idle'
  }
}

export function createNodes(deps: NodeDeps) {
  const { bot, holder } = deps
  const control = holder.control
  const safety = holder.safety

  // OBSERVE: snapshot imutável (D-04) + pipeline de motivação com pesos por disposição (D-06).
  const observe = async (_s: LoopState): Promise<Partial<LoopState>> => {
    // CR#1 a jusante: a percepção é defensiva (retorna null na morte/void). Um tick que falha na
    // percepção deve degradar para idle, NUNCA derrubar o driver — por isso embrulhamos a chamada:
    // null (corpo ausente) ou exceção inesperada => { snapshot: null }. analyze (if !s.snapshot ->
    // idle) e execute (cada ramo guardado por `if (snap && ...)`) já tratam null com segurança.
    let snapshot: WorldSnapshot | null
    try {
      snapshot = buildWorldSnapshot(bot)
    } catch (err) {
      log(`percepção falhou: ${err instanceof Error ? err.message : err} — tick degrada para idle`)
      snapshot = null
    }
    if (!snapshot) {
      return { snapshot: null }
    }
    const t = now()
    const mcfg = motivationConfigFor(holder.disposition) // pesos POR DISPOSIÇÃO (D-06/D-10)

    // necessidades (NEED-01/02) — escreve no holder (fonte única)
    holder.needs = evaluateNeeds(holder.needs, snapshot, t, mcfg)

    // objetivos (GOAL-01/02): gera candidatos e seleciona com histerese/preempção
    const candidates = generateGoals(holder.needs, t, mcfg)
    const survivalNeed = holder.needs.find((n) => n.kind === 'survival')
    const survivalCritical =
      survivalNeed !== undefined &&
      urgency(survivalNeed, t, mcfg) > 0 &&
      survivalNeed.value < mcfg.survivalCriticalThreshold
    const selected = selectGoal(holder.currentGoal, candidates, {
      survivalCritical,
      playerRequestPending: holder.playerRequestPending,
      disposition: holder.disposition,
    }, mcfg)
    holder.goals = candidates
    holder.currentGoal = selected

    // consumiu um pedido de jogador → reseta o sinal (Plan 04 volta a setá-lo)
    if (selected?.source === 'player_request') holder.playerRequestPending = false

    return {
      snapshot,
      needs: holder.needs,
      goals: holder.goals,
      currentGoal: holder.currentGoal,
      disposition: holder.disposition,
    }
  }

  // ANALYZE: prefere a decisão LLM FRESCA do holder; senão degrada ao arbiter (D-17).
  const analyze = async (s: LoopState): Promise<Partial<LoopState>> => {
    if (!s.snapshot) return { cogState: 'idle' }
    const excluded = cooledDownTargets(safety, now())

    let next: CognitiveState | null = null
    const fresh = holder.llmDecision
    // frescor: a decisão LLM vale por até 2x o intervalo de replan (D-19); modo de controle pode vetar.
    if (
      fresh &&
      now() - fresh.at < config.replanMinIntervalMs * 2 &&
      control.getMode() === 'autonomous' // paused/standby seguem a arbitragem determinística
    ) {
      next = actionToCognitiveState(fresh.decision.action)
    }

    if (next === null) next = arbitrate(s.snapshot, control.getMode(), excluded) // D-17 fallback
    if (shouldFallbackToIdle(safety)) next = 'idle' // D-11: backoff -> Idle
    return { cogState: next }
  }

  // UPDATE MEMORY: no-op nominal — a transição de estado é gravada no execute (precisa do from/to).
  const updateMemory = async (_s: LoopState): Promise<Partial<LoopState>> => {
    return {}
  }

  // DECIDE: resolve um target-hint a partir de currentGoal/llmDecision quando aplicável.
  // Params físicos continuam montados pelo executor/skillRegistry (D-10) — nunca pelo LLM cru.
  const decide = async (_s: LoopState): Promise<Partial<LoopState>> => {
    return {}
  }

  // EXECUTE: dispara NO MÁXIMO uma skill (D-02 single-flight). Grava memória NO HOLDER (fonte única).
  const execute = async (s: LoopState): Promise<Partial<LoopState>> => {
    const snap = s.snapshot
    const state = s.cogState
    const fresh = holder.llmDecision
    const llmTarget =
      fresh && now() - fresh.at < config.replanMinIntervalMs * 2 ? fresh.decision.target : undefined

    log(`estado=${state} modo=${control.getMode()} objetivo=${holder.currentGoal?.id ?? '-'}`)

    // mapeia estado -> (skill, target). Apenas estados ativos disparam skill.
    let skill: string | null = null
    let target = ''
    if (snap && state === 'gathering') {
      // alvo do LLM (se for um bloco da escada presente) tem preferência; senão a escada de prioridade.
      const cd = cooledDownTargets(safety, now())
      const llmBlock =
        llmTarget && snap.nearbyBlockTypes[llmTarget] && !cd.has(llmTarget) ? llmTarget : null
      const t = llmBlock ?? highestPriorityGatherTarget(snap, cd)
      if (t) {
        skill = 'dig'
        target = t
      }
    } else if (snap && state === 'exploring') {
      // exploring: navega para um ponto deslocado (vaguear visível). Sem alvo de bloco.
      skill = 'navigate'
      const p = snap.status.position
      target = JSON.stringify({
        x: Math.round(p.x + (Math.random() * 16 - 8)),
        y: Math.round(p.y),
        z: Math.round(p.z + (Math.random() * 16 - 8)),
      })
    } else if (snap && state === 'socializing') {
      // standby/jogador próximo: SÓ se aproxima se estiver LONGE. Já dentro de socialArriveRadius
      // => fica parado neste tick. Sem isso, a posição do jogador oscila nos decimais a cada tick,
      // a string-alvo muda, o guard anti-repetição nunca acumula e o bot re-navega pro mesmo ponto
      // infinitamente (flood de 'OK navigate'). Distância calculada do bot, não confia em p.distance.
      const player = [...snap.players]
        .filter((p) => p.position)
        .sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9))[0]
      if (player?.position) {
        const bp = snap.status.position
        const dx = player.position.x - bp.x
        const dy = player.position.y - bp.y
        const dz = player.position.z - bp.z
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (dist > config.socialArriveRadius) {
          skill = 'navigate'
          target = JSON.stringify(player.position)
        }
      }
    }
    // idle / fighting(stub) / building(stub): nenhuma skill (D-06)

    if (!skill) {
      log(`sem acao (estado=${state})`)
      return { memory: holder.memory }
    }

    // D-10: anti-repetição
    recordAttempt(safety, skill, target)
    if (shouldAbandon(safety)) {
      log(`abandonando ${skill}:${target} (repetido ${config.antiRepeatN}x sem progresso)`)
      recordFailure(safety, target, now())
      holder.memory = push(holder.memory, {
        type: 'action',
        skill,
        target,
        outcome: 'no_effect',
        observed: 0,
        expected: 0,
        result: 'failure',
        reason: 'anti-repeat',
        timestamp: now(),
      })
      return { memory: holder.memory }
    }

    // D-02: single-flight — UMA skill, aguardada.
    // 999.1 D-06: sem wrap externo — cada skill se auto-embrulha em executeWithSafety com seu
    // próprio progressChecker (dig usa inventário; navigate usa navigateTimeoutMs). O wrap externo
    // usava defaults genéricos e duplicava o watchdog interno.
    try {
      const params = skill === 'dig' ? { target } : { target: JSON.parse(target) }
      // D-09 B: a memória deriva do SkillResult OBSERVADO (result.outcome), NUNCA do não-throw.
      // Mata o bug histórico "peguei 10 tábuas" (success por Promise resolvida com observed:0).
      const result = await skillRegistry[skill!]!(bot, params)
      const success = result.outcome === 'success'
      if (success) recordSuccess(safety)
      else recordFailure(safety, target, now()) // GRND-04: partial/no_effect/error = não-sucesso
      holder.lastObservedDelta = {
        skill,
        target,
        outcome: result.outcome,
        observed: result.observed,
        expected: result.expected,
        delta: { ...result.delta },
        at: now(),
      }
      holder.memory = push(holder.memory, {
        type: 'action',
        skill,
        target,
        outcome: result.outcome,
        observed: result.observed,
        expected: result.expected,
        result: success ? 'success' : 'failure', // derivado (GRND-04)
        reason: result.reason,
        timestamp: now(),
      })
      log(`${result.outcome.toUpperCase()} ${skill} ${target} (${result.observed}/${result.expected})`)
    } catch (err) {
      // Catch agora SÓ para exceções genuínas inesperadas (D-12) — skills não lançam como fluxo.
      const reason = err instanceof Error ? err.name : String(err)
      recordFailure(safety, target, now())
      holder.lastObservedDelta = { skill, target, outcome: 'error', observed: 0, expected: 0, delta: {}, at: now() }
      holder.memory = push(holder.memory, {
        type: 'action',
        skill,
        target,
        outcome: 'error',
        observed: 0,
        expected: 0,
        result: 'failure',
        reason,
        timestamp: now(),
      })
      log(`ERRO inesperado ${skill} ${target}: ${reason}`)
    }
    return { memory: holder.memory }
  }

  return { observe, analyze, updateMemory, decide, execute }
}
