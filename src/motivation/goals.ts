// src/motivation/goals.ts
// GOAL-01/02: objetivos dinâmicos com prioridade/progresso/dependências,
// gerados a partir de necessidades (D-16), e comprometimento por histerese
// com preempção bem definida (D-15).
// Módulo PURO (estilo arbiter.ts/safety.ts): tempo e config por parâmetro.
// SEM Date.now(), SEM config global.
import { urgency } from './needs'
import {
  ACTIVE_NEEDS,
  type Goal,
  type MotivationConfig,
  type Need,
  type SelectGoalContext,
} from './types'

const ACTIVE_SET = new Set<string>(ACTIVE_NEEDS)

/**
 * Gera um Goal por necessidade ATIVA cuja urgency cruza cfg.goalThreshold (GOAL-01).
 * id estável por kind (`need:<kind>`); priority = urgency; progress 0; source 'need'.
 * NOTA D-16: dependsOn é ESTRUTURAL apenas — sempre [] aqui e selectGoal NÃO o
 * consulta. A resolução comportamental de dependências fica para iteração futura
 * (gap conhecido documentado no SUMMARY).
 */
export function generateGoals(needs: Need[], now: number, cfg: MotivationConfig): Goal[] {
  const goals: Goal[] = []
  for (const need of needs) {
    if (!ACTIVE_SET.has(need.kind)) continue // ignora stub (shelter/social, D-08)
    const u = urgency(need, now, cfg)
    if (u < cfg.goalThreshold) continue
    goals.push({
      id: `need:${need.kind}`,
      kind: need.kind,
      priority: u,
      progress: 0,
      dependsOn: [], // D-16: estrutural, sempre vazio nesta fase
      source: 'need',
      committedAt: now,
    })
  }
  return goals
}

/** Candidato de maior priority (null se vazio). */
function bestCandidate(candidates: Goal[]): Goal | null {
  let best: Goal | null = null
  for (const g of candidates) {
    if (best === null || g.priority > best.priority) best = g
  }
  return best
}

/**
 * Seleciona o objetivo com guarded execution + preempção (D-15):
 * - Preempta (ignora histerese, escolhe o melhor candidato) quando sobrevivência
 *   crítica OU (em ASSISTANT) pedido de jogador pendente.
 * - Caso contrário, mantém o objetivo atual a menos que o melhor candidato o
 *   supere pela margem de histerese (cfg.hysteresisMargin) — GOAL-02.
 */
export function selectGoal(
  current: Goal | null,
  candidates: Goal[],
  ctx: SelectGoalContext,
  cfg: MotivationConfig,
): Goal | null {
  const preempt =
    ctx.survivalCritical || (ctx.disposition === 'ASSISTANT' && ctx.playerRequestPending)

  if (current && !preempt) {
    const best = bestCandidate(candidates)
    // histerese: só troca se o melhor superar o atual pela margem (não por empate).
    if (!best || best.priority < current.priority + cfg.hysteresisMargin) return current
  }
  return bestCandidate(candidates) ?? current
}

/** Avança o progresso de um objetivo (imutável), com clamp 0..1. */
export function advanceProgress(goal: Goal, delta: number): Goal {
  const progress = Math.max(0, Math.min(1, goal.progress + delta))
  return { ...goal, progress }
}
