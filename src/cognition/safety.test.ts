// src/cognition/safety.test.ts
// Cobre anti-repetição (D-10) e backoff de falha de skill (D-11 / COG-04).
import { test, expect } from 'bun:test'
import {
  createSafetyState,
  recordAttempt,
  shouldAbandon,
  recordFailure,
  recordSuccess,
  shouldFallbackToIdle,
  isInCooldown,
  cooledDownTargets,
  isSkillFailure,
} from './safety'
import { SkillTimeoutError, SkillStuckError } from '../skills/executor'

// --- estado inicial ---

test('createSafetyState inicia zerado', () => {
  const s = createSafetyState()
  expect(s.repeatCount).toBe(0)
  expect(s.consecutiveFailures).toBe(0)
  expect(s.cooldownUntil.size).toBe(0)
  expect(s.lastKey).toBeNull()
})

// --- anti-repetição (D-10) ---

test('recordAttempt mesma (skill,target) incrementa repeatCount', () => {
  const s = createSafetyState()
  recordAttempt(s, 'collect', 'oak_log')
  recordAttempt(s, 'collect', 'oak_log')
  recordAttempt(s, 'collect', 'oak_log')
  expect(s.repeatCount).toBe(3)
})

test('recordAttempt com par diferente reseta repeatCount para 1', () => {
  const s = createSafetyState()
  recordAttempt(s, 'collect', 'oak_log')
  recordAttempt(s, 'collect', 'oak_log')
  recordAttempt(s, 'collect', 'stone') // mudou -> reseta
  expect(s.repeatCount).toBe(1)
})

test('shouldAbandon true quando repeatCount >= antiRepeatN (3)', () => {
  const s = createSafetyState()
  recordAttempt(s, 'collect', 'oak_log')
  recordAttempt(s, 'collect', 'oak_log')
  expect(shouldAbandon(s)).toBe(false)
  recordAttempt(s, 'collect', 'oak_log') // 3 == N
  expect(shouldAbandon(s)).toBe(true)
})

// --- backoff de falha (D-11) ---

test('recordFailure incrementa consecutiveFailures e põe target em cooldown', () => {
  const s = createSafetyState()
  recordFailure(s, 'oak_log', 1000)
  expect(s.consecutiveFailures).toBe(1)
  expect(s.cooldownUntil.get('oak_log')).toBeGreaterThan(1000)
})

test('shouldFallbackToIdle true quando consecutiveFailures >= backoffM (3)', () => {
  const s = createSafetyState()
  recordFailure(s, 'oak_log', 1000)
  recordFailure(s, 'oak_log', 1000)
  expect(shouldFallbackToIdle(s)).toBe(false)
  recordFailure(s, 'oak_log', 1000) // 3 == M
  expect(shouldFallbackToIdle(s)).toBe(true)
})

test('recordSuccess zera contadores de segurança', () => {
  const s = createSafetyState()
  recordAttempt(s, 'collect', 'oak_log')
  recordFailure(s, 'oak_log', 1000)
  recordSuccess(s)
  expect(s.consecutiveFailures).toBe(0)
  expect(s.repeatCount).toBe(0)
  expect(s.lastKey).toBeNull()
})

// --- cooldown determinístico via `now` ---

test('isInCooldown true antes do until, false depois (now explícito)', () => {
  const s = createSafetyState()
  recordFailure(s, 'oak_log', 1000) // cooldown até 1000 + targetCooldownMs
  expect(isInCooldown(s, 'oak_log', 1000 + 1)).toBe(true)
  expect(isInCooldown(s, 'oak_log', 1000 + 999999)).toBe(false)
})

test('isInCooldown false para target nunca falho', () => {
  const s = createSafetyState()
  expect(isInCooldown(s, 'stone', 5000)).toBe(false)
})

test('cooledDownTargets retorna só os ainda em cooldown no `now`', () => {
  const s = createSafetyState()
  recordFailure(s, 'oak_log', 1000)
  recordFailure(s, 'stone', 1000)
  const ativos = cooledDownTargets(s, 1000 + 1)
  expect(ativos.has('oak_log')).toBe(true)
  expect(ativos.has('stone')).toBe(true)
  const expirados = cooledDownTargets(s, 1000 + 999999)
  expect(expirados.size).toBe(0)
})

// --- classificação de erro de skill ---

test('isSkillFailure reconhece SkillTimeoutError e SkillStuckError', () => {
  expect(isSkillFailure(new SkillTimeoutError(1000))).toBe(true)
  expect(isSkillFailure(new SkillStuckError(1000))).toBe(true)
})

test('isSkillFailure trata qualquer Error como falha (D-11)', () => {
  expect(isSkillFailure(new Error('bloco não encontrado'))).toBe(true)
})

test('isSkillFailure false para não-Error', () => {
  expect(isSkillFailure('boom')).toBe(false)
  expect(isSkillFailure(null)).toBe(false)
})
