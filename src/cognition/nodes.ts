// src/cognition/nodes.ts
// Nós do StateGraph (Fase 2). bot/control/safety por closure (Pitfall 3). Sem LLM.
import type { Bot } from 'mineflayer'
import type { WorldSnapshot } from '../perception/types'
import { buildWorldSnapshot } from '../perception/snapshot'
import { skillRegistry, executeWithSafety } from '../skills/index'
import { config } from '../config'
import type { CognitiveState } from './types'
import type { ShortTermMemory } from '../memory/shortTerm'
import { push } from '../memory/shortTerm'
import type { ControlState } from '../control/commands'
import { arbitrate, highestPriorityGatherTarget } from './arbiter'
import {
  type SafetyState,
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
}

export interface NodeDeps {
  bot: Bot
  control: ControlState
  safety: SafetyState
}

const now = () => Date.now()
const log = (msg: string) => console.log(`[loop] ${msg}`)

export function createNodes(deps: NodeDeps) {
  const { bot, control, safety } = deps

  // OBSERVE: captura snapshot imutavel (D-04). bot via closure.
  const observe = async (_s: LoopState): Promise<Partial<LoopState>> => {
    return { snapshot: buildWorldSnapshot(bot) }
  }

  // ANALYZE: deriva estado por arbitragem de prioridade fixa (D-05), excluindo alvos em cooldown (D-11).
  const analyze = async (s: LoopState): Promise<Partial<LoopState>> => {
    if (!s.snapshot) return { cogState: 'idle' }
    const excluded = cooledDownTargets(safety, now())
    let next = arbitrate(s.snapshot, control.getMode(), excluded)
    if (shouldFallbackToIdle(safety)) next = 'idle' // D-11: backoff -> Idle
    return { cogState: next }
  }

  // UPDATE MEMORY: no-op nominal — a transicao de estado e gravada no execute (precisa do from/to resolvido).
  // Mantido no grafo para fidelidade ao ciclo nomeado Observe->Analyze->UpdateMemory->Decide->Execute (D-01).
  const updateMemory = async (_s: LoopState): Promise<Partial<LoopState>> => {
    return {}
  }

  // DECIDE: no-op nominal — a logica de transicao/execucao foi consolidada no execute (cogState ja resolvido).
  const decide = async (_s: LoopState): Promise<Partial<LoopState>> => {
    return {}
  }

  // EXECUTE: dispara NO MAXIMO uma skill via executeWithSafety (D-02 single-flight). Atualiza memoria + safety.
  const execute = async (s: LoopState): Promise<Partial<LoopState>> => {
    const snap = s.snapshot
    const state = s.cogState
    let memory = s.memory

    // grava transicao de estado (D-12) — log torna o comportamento visivel (Criterio #2)
    log(`estado=${state} modo=${control.getMode()}`)

    // mapeia estado -> (skill, target). Apenas estados ativos disparam skill.
    let skill: string | null = null
    let target = ''
    if (snap && state === 'gathering') {
      const t = highestPriorityGatherTarget(snap, cooledDownTargets(safety, now()))
      if (t) {
        skill = 'dig'
        target = t
      }
    } else if (snap && state === 'exploring') {
      // exploring: navega para um ponto deslocado (vaguear visivel). Sem alvo de bloco.
      skill = 'navigate'
      const p = snap.status.position
      target = JSON.stringify({
        x: Math.round(p.x + (Math.random() * 16 - 8)),
        y: Math.round(p.y),
        z: Math.round(p.z + (Math.random() * 16 - 8)),
      })
    } else if (snap && state === 'socializing') {
      // standby/jogador proximo: aproxima-se do jogador mais proximo e aguarda (usa navigate, nao o stub follow)
      const player = [...snap.players]
        .filter((p) => p.position)
        .sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9))[0]
      if (player?.position) {
        skill = 'navigate'
        target = JSON.stringify(player.position)
      }
    }
    // idle / fighting(stub) / building(stub): nenhuma skill (D-06)

    if (!skill) {
      log(`sem acao (estado=${state})`)
      return { memory }
    }

    // D-10: anti-repeticao
    recordAttempt(safety, skill, target)
    if (shouldAbandon(safety)) {
      log(`abandonando ${skill}:${target} (repetido ${config.antiRepeatN}x sem progresso)`)
      recordFailure(safety, target, now()) // marca cooldown e conta como falha
      memory = push(memory, {
        type: 'action',
        skill,
        target,
        result: 'failure',
        reason: 'anti-repeat',
        timestamp: now(),
      })
      return { memory }
    }

    // D-02: single-flight — UMA skill, aguardada. executeWithSafety ja faz timeout/watchdog (Fase 1).
    try {
      const params = skill === 'dig' ? { target } : { target: JSON.parse(target) }
      await executeWithSafety(() => skillRegistry[skill!]!(bot, params))
      recordSuccess(safety)
      memory = push(memory, { type: 'action', skill, target, result: 'success', timestamp: now() })
      log(`OK ${skill} ${target}`)
    } catch (err) {
      const reason = err instanceof Error ? err.name : String(err)
      recordFailure(safety, target, now()) // D-11: backoff
      memory = push(memory, { type: 'action', skill, target, result: 'failure', reason, timestamp: now() })
      log(`FALHA ${skill} ${target}: ${reason}`)
    }
    return { memory }
  }

  return { observe, analyze, updateMemory, decide, execute }
}
