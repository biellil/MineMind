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

/**
 * evaluateCraft (D-18): classifica o craft pelo GANHO do item-alvo no inventário (mesma forma do dig).
 * observed = só o delta positivo de `targetName` (ignora consumos de ingredientes). Se a ação lançou
 * E não produziu nada (observed 0) → 'error' com reason; senão no_effect/partial/success por ternário.
 *
 * @param threw exceção opcional capturada por quem chamou (ex.: "Recipe requires craftingTable").
 */
export function evaluateCraft(
  before: GroundState,
  after: GroundState,
  targetName: string,
  expected: number,
  threw?: unknown,
): SkillResult {
  const delta = inventoryDelta(before, after)
  const observed = Math.max(0, delta[targetName] ?? 0) // só ganho do item-alvo (D-18)
  let outcome: SkillResult['outcome']
  if (observed === 0) outcome = threw ? 'error' : 'no_effect'
  else if (observed >= expected) outcome = 'success'
  else outcome = 'partial'
  const reason = threw ? (threw instanceof Error ? threw.message : String(threw)) : undefined
  return { outcome, observed, expected, delta, reason }
}

/**
 * evaluateSmelt (D-20): idêntico em forma a evaluateCraft — a verdade é o GANHO do item fundido
 * (`targetName`). O `delta` retornado mantém os consumos negativos (input/fuel) para visibilidade,
 * mas `observed` conta SÓ o ganho do alvo. Delega a evaluateCraft (mesma lógica numérica).
 */
export function evaluateSmelt(
  before: GroundState,
  after: GroundState,
  targetName: string,
  expected: number,
  threw?: unknown,
): SkillResult {
  return evaluateCraft(before, after, targetName, expected, threw)
}

/**
 * evaluateEquip (D-19, LOCAL): equip NÃO muda contagem de inventário — o grounding é o estado LOCAL
 * "está equipado?" (booleano vindo de bot.heldItem/inventory.slots). NÃO recebe GroundState.
 *
 * @param equipped true se o item-alvo está de fato equipado após a ação.
 */
export function evaluateEquip(equipped: boolean): SkillResult {
  return {
    outcome: equipped ? 'success' : 'no_effect',
    observed: equipped ? 1 : 0,
    expected: 1,
    delta: {},
  }
}
