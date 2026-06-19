// src/cognition/personality.ts
// SOC-02 / D-14: personalidade evolutiva DETERMINÍSTICA. PersonalityState é derivado por
// contadores fixos sobre uma baseline imutável + mean-reversion por tempo decorrido — NENHUM
// parâmetro de modelo é treinado e NENHUM LLM toca o estado. A fronteira vs ADV-01 (v2) é
// estrutural: este módulo é PURO (tempo por parâmetro, sem Date.now(), sem qualquer LLM).
import type { MemEvent } from './types'

/** Estado de personalidade evolutivo (D-14). Campos derivados — NENHUM parâmetro de modelo. */
export interface PersonalityState {
  mood: number // -1..1
  socialEnergy: number // 0..1
  confidence: number // 0..1
  updatedAt: number
}

const clampSigned = (x: number): number => Math.max(-1, Math.min(1, x))
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x))

const BASELINE_MOOD = 0
const BASELINE_CONFIDENCE = 0.5
/** Taxa de mean-reversion por minuto (mood/confidence convergem à baseline). */
const REVERT_RATE_PER_MIN = 0.02
/** Recarga de energia social por minuto idle. */
const SOCIAL_RECHARGE_PER_MIN = 0.01

/** Baseline neutra (D-14): mood/confidence no centro, energia social cheia. */
export function defaultPersonality(now: number): PersonalityState {
  return { mood: BASELINE_MOOD, socialEnergy: 1, confidence: BASELINE_CONFIDENCE, updatedAt: now }
}

/**
 * Atualiza o estado por contadores determinísticos derivados de um MemEvent (D-14). Imutável —
 * devolve um novo objeto. Os deltas são fixos; nenhuma string livre/LLM os influencia.
 */
export function applyEventToPersonality(p: PersonalityState, e: MemEvent, now: number): PersonalityState {
  let { mood, socialEnergy, confidence } = p
  if (e.type === 'world' && e.event === 'damage') {
    mood = clampSigned(mood - 0.15)
  } else if (e.type === 'action' && e.outcome === 'success') {
    mood = clampSigned(mood + 0.05)
    confidence = clamp01(confidence + 0.05)
  } else if (
    e.type === 'action' &&
    (e.outcome === 'error' || e.outcome === 'no_effect' || e.outcome === 'partial')
  ) {
    // partial conta como não-sucesso para o humor — coerente com GRND-04.
    confidence = clamp01(confidence - 0.08)
  } else if (e.type === 'state_transition' && e.to === 'socializing') {
    socialEnergy = clamp01(socialEnergy - 0.1)
  }
  return { mood, socialEnergy, confidence, updatedAt: now }
}

/** Move `v` em direção a `baseline` por `step`, sem ultrapassar a baseline. */
function revertToward(v: number, baseline: number, step: number): number {
  if (v > baseline) return Math.max(baseline, v - step)
  if (v < baseline) return Math.min(baseline, v + step)
  return baseline
}

/**
 * Mean-reversion por tempo decorrido (boot/idle, D-14): mood e confidence convergem às suas
 * baselines por uma taxa pequena por minuto; socialEnergy recarrega. Após muito tempo, o estado
 * converge exatamente à baseline (sem ultrapassar). Imutável; elapsed <= 0 retorna inalterado.
 */
export function decayPersonality(p: PersonalityState, now: number): PersonalityState {
  const elapsedMin = (now - p.updatedAt) / 60_000
  if (elapsedMin <= 0) return p
  const step = REVERT_RATE_PER_MIN * elapsedMin
  return {
    mood: revertToward(p.mood, BASELINE_MOOD, step),
    confidence: revertToward(p.confidence, BASELINE_CONFIDENCE, step),
    socialEnergy: clamp01(p.socialEnergy + SOCIAL_RECHARGE_PER_MIN * elapsedMin),
    updatedAt: now,
  }
}
