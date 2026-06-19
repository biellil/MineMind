// src/grounding/evaluate.ts
// Fase 7 D-04/D-06 — julgamento PURO de sucesso por skill. observed = fonte de verdade; label derivado.
import type { GroundState, SkillResult } from './types'
import { inventoryDelta } from './capture'

/** Soma só os deltas POSITIVOS (itens ganhos) — coleta nunca credita por perda de item. */
function gainedTotal(delta: Record<string, number>): number {
  return Object.values(delta).reduce((s, d) => (d > 0 ? s + d : s), 0)
}

/** evaluateDig: classifica coleta por delta de inventário (D-06 ternário). expected = count do dig. */
export function evaluateDig(before: GroundState, after: GroundState, expected: number): SkillResult {
  const delta = inventoryDelta(before, after)
  const observed = gainedTotal(delta)
  let outcome: SkillResult['outcome']
  if (observed === 0) outcome = 'no_effect'
  else if (observed >= expected) outcome = 'success'
  else outcome = 'partial'
  return { outcome, observed, expected, delta }
}

/** evaluateNavigate: chegou ao range? observed 1/0; expected sempre 1. */
export function evaluateNavigate(
  before: GroundState,
  after: GroundState,
  targetPos: { x: number; y: number; z: number },
  range: number,
): SkillResult {
  const dx = after.position.x - targetPos.x
  const dy = after.position.y - targetPos.y
  const dz = after.position.z - targetPos.z
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
  const moved =
    Math.round(before.position.x * 10) !== Math.round(after.position.x * 10) ||
    Math.round(before.position.y * 10) !== Math.round(after.position.y * 10) ||
    Math.round(before.position.z * 10) !== Math.round(after.position.z * 10)
  let outcome: SkillResult['outcome']
  let observed: number
  if (dist <= range) { outcome = 'success'; observed = 1 }
  else if (moved) { outcome = 'partial'; observed = 0 }
  else { outcome = 'no_effect'; observed = 0 }
  return { outcome, observed, expected: 1, delta: {} }
}
