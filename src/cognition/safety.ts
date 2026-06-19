// src/cognition/safety.ts
// D-10: anti-repetição (mesma ação N vezes sem progresso -> abandona).
// D-11: backoff de falha (cooldown de alvo; M falhas consecutivas -> Idle).
// Máquina de estado PURA: sem timers, sem bot. O tempo entra como parâmetro `now`.
import { config } from '../config'

export interface SafetyState {
  lastKey: string | null              // `${skill}:${target}` do último attempt
  repeatCount: number                 // quantas vezes a mesma key repetiu sem progresso
  consecutiveFailures: number         // falhas de skill seguidas (D-11)
  cooldownUntil: Map<string, number>  // target -> timestamp (ms) até quando está em cooldown
}

export function createSafetyState(): SafetyState {
  return { lastKey: null, repeatCount: 0, consecutiveFailures: 0, cooldownUntil: new Map() }
}

const keyOf = (skill: string, target: string) => `${skill}:${target}`

/** Registra uma tentativa. Se for a mesma do anterior, incrementa repeatCount; senão reseta para 1. */
export function recordAttempt(s: SafetyState, skill: string, target: string): void {
  const key = keyOf(skill, target)
  if (key === s.lastKey) s.repeatCount += 1
  else {
    s.lastKey = key
    s.repeatCount = 1
  }
}

/** D-10: abandonar quando a mesma ação/alvo repetiu N vezes sem progresso. */
export function shouldAbandon(s: SafetyState): boolean {
  return s.repeatCount >= config.antiRepeatN
}

/** D-11: registra falha de skill (timeout/stuck), põe alvo em cooldown e conta falha consecutiva. */
export function recordFailure(s: SafetyState, target: string, now: number = Date.now()): void {
  s.consecutiveFailures += 1
  s.cooldownUntil.set(target, now + config.targetCooldownMs)
}

/** Sucesso zera os contadores de segurança. */
export function recordSuccess(s: SafetyState): void {
  s.consecutiveFailures = 0
  s.repeatCount = 0
  s.lastKey = null
}

/** D-11: cair para Idle quando M falhas consecutivas. */
export function shouldFallbackToIdle(s: SafetyState): boolean {
  return s.consecutiveFailures >= config.backoffM
}

export function isInCooldown(s: SafetyState, target: string, now: number = Date.now()): boolean {
  const until = s.cooldownUntil.get(target)
  return until !== undefined && now < until
}

/** Set de targets ainda em cooldown — passar como excludeTargets para arbitrate (D-05/D-07). */
export function cooledDownTargets(s: SafetyState, now: number = Date.now()): Set<string> {
  const out = new Set<string>()
  for (const [target, until] of s.cooldownUntil) if (now < until) out.add(target)
  return out
}

/**
 * Classifica um erro de skill como falha que alimenta o backoff (D-11).
 * Qualquer Error lançado por uma skill conta como falha (timeout, stuck, ou
 * "bloco não encontrado"). As checagens de name documentam as origens conhecidas
 * do executor; o fallback aceita qualquer Error. Valores não-Error não contam.
 */
export function isSkillFailure(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  // Origens conhecidas do executor (documentadas); qualquer outro Error também conta.
  return err.name === 'SkillTimeoutError' || err.name === 'SkillStuckError' || true
}
