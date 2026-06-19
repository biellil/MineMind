// src/cognition/personality.test.ts
// SOC-02 / D-14: PersonalityState evolutivo DETERMINÍSTICO. Contadores sobre uma baseline imutável
// + mean-reversion por tempo. NENHUM ML/LLM toca o estado (fronteira estrutural vs ADV-01).
// Módulo PURO: tempo por parâmetro, sem Date.now().
import { test, expect } from 'bun:test'
import type { MemEvent } from './types'
import {
  defaultPersonality,
  applyEventToPersonality,
  decayPersonality,
  type PersonalityState,
} from './personality'

test('defaultPersonality retorna a baseline neutra { mood:0, socialEnergy:1, confidence:0.5 }', () => {
  const p = defaultPersonality(1000)
  expect(p).toEqual({ mood: 0, socialEnergy: 1, confidence: 0.5, updatedAt: 1000 })
})

test('world/damage baixa mood (-0.15)', () => {
  const e: MemEvent = { type: 'world', event: 'damage', detail: 'zombie', timestamp: 5 }
  const p = applyEventToPersonality(defaultPersonality(0), e, 5)
  expect(p.mood).toBeCloseTo(-0.15, 5)
  expect(p.updatedAt).toBe(5)
})

test('mood é clampado em -1 sob dano repetido', () => {
  let p = defaultPersonality(0)
  const e: MemEvent = { type: 'world', event: 'damage', detail: 'fall', timestamp: 1 }
  for (let i = 0; i < 20; i++) p = applyEventToPersonality(p, e, i)
  expect(p.mood).toBe(-1)
})

test('action success sobe mood (+0.05) e confidence (+0.05)', () => {
  const e: MemEvent = { type: 'action', skill: 'gather', target: 'wood', outcome: 'success', observed: 1, expected: 1, result: 'success', timestamp: 9 }
  const p = applyEventToPersonality(defaultPersonality(0), e, 9)
  expect(p.mood).toBeCloseTo(0.05, 5)
  expect(p.confidence).toBeCloseTo(0.55, 5)
})

test('action failure baixa confidence (-0.08), mood inalterado', () => {
  const e: MemEvent = { type: 'action', skill: 'gather', target: 'wood', outcome: 'no_effect', observed: 0, expected: 1, result: 'failure', timestamp: 9 }
  const p = applyEventToPersonality(defaultPersonality(0), e, 9)
  expect(p.confidence).toBeCloseTo(0.42, 5)
  expect(p.mood).toBe(0)
})

test('state_transition para socializing baixa socialEnergy (-0.1, clamp 0)', () => {
  const e: MemEvent = { type: 'state_transition', from: 'idle', to: 'socializing', timestamp: 3 }
  let p = applyEventToPersonality(defaultPersonality(0), e, 3)
  expect(p.socialEnergy).toBeCloseTo(0.9, 5)
  // satura em 0
  for (let i = 0; i < 20; i++) p = applyEventToPersonality(p, e, i)
  expect(p.socialEnergy).toBe(0)
})

test('applyEventToPersonality é imutável (não muta o estado de entrada)', () => {
  const base = defaultPersonality(0)
  const e: MemEvent = { type: 'world', event: 'damage', detail: 'x', timestamp: 1 }
  applyEventToPersonality(base, e, 1)
  expect(base.mood).toBe(0) // o original permanece intacto
})

test('decayPersonality reverte mood→0 e confidence→0.5 e recarrega socialEnergy ao longo do tempo', () => {
  // Estado deslocado da baseline e com socialEnergy gasta.
  const p0: PersonalityState = { mood: -0.5, socialEnergy: 0.2, confidence: 0.9, updatedAt: 0 }
  // 1 minuto: passos pequenos em direção à baseline; socialEnergy +0.01/min.
  const p1 = decayPersonality(p0, 60_000)
  expect(p1.mood).toBeGreaterThan(p0.mood) // sobe em direção a 0
  expect(p1.mood).toBeLessThanOrEqual(0)
  expect(p1.confidence).toBeLessThan(p0.confidence) // desce em direção a 0.5
  expect(p1.confidence).toBeGreaterThanOrEqual(0.5)
  expect(p1.socialEnergy).toBeCloseTo(0.21, 5)
  expect(p1.updatedAt).toBe(60_000)
})

test('decayPersonality converge à baseline após muito tempo (sem ultrapassar)', () => {
  const p0: PersonalityState = { mood: -0.8, socialEnergy: 0.0, confidence: 0.95, updatedAt: 0 }
  const p = decayPersonality(p0, 1_000 * 60_000) // tempo enorme
  expect(p.mood).toBe(0)
  expect(p.confidence).toBe(0.5)
  expect(p.socialEnergy).toBe(1)
})

test('decayPersonality tolera elapsed <= 0 (retorna inalterado)', () => {
  const p0: PersonalityState = { mood: -0.5, socialEnergy: 0.2, confidence: 0.9, updatedAt: 1000 }
  expect(decayPersonality(p0, 1000)).toEqual(p0)
  expect(decayPersonality(p0, 500)).toEqual(p0)
})

test('todos os campos permanecem nos ranges sob sequência arbitrária de eventos', () => {
  let p = defaultPersonality(0)
  const events: MemEvent[] = [
    { type: 'world', event: 'damage', detail: 'a', timestamp: 1 },
    { type: 'action', skill: 's', target: 't', outcome: 'no_effect', observed: 0, expected: 1, result: 'failure', timestamp: 2 },
    { type: 'action', skill: 's', target: 't', outcome: 'success', observed: 1, expected: 1, result: 'success', timestamp: 3 },
    { type: 'state_transition', from: 'idle', to: 'socializing', timestamp: 4 },
  ]
  for (let i = 0; i < 50; i++) {
    p = applyEventToPersonality(p, events[i % events.length], i)
    p = decayPersonality(p, i * 60_000)
  }
  expect(p.mood).toBeGreaterThanOrEqual(-1)
  expect(p.mood).toBeLessThanOrEqual(1)
  expect(p.socialEnergy).toBeGreaterThanOrEqual(0)
  expect(p.socialEnergy).toBeLessThanOrEqual(1)
  expect(p.confidence).toBeGreaterThanOrEqual(0)
  expect(p.confidence).toBeLessThanOrEqual(1)
})
