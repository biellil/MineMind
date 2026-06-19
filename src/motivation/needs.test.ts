// src/motivation/needs.test.ts
// Cobre necessidades híbridas (D-09), stub de shelter/social (D-08) e
// anti-starvation monotônico (NEED-02/D-11). Módulo PURO — tempo por parâmetro.
import { test, expect } from 'bun:test'
import { createNeeds, evaluateNeeds, urgency } from './needs'
import { ACTIVE_NEEDS, STUB_NEEDS, type MotivationConfig, type Need } from './types'
import type { WorldSnapshot } from '../perception/types'

// cfg de teste fixo (determinístico — não depende de config global).
const cfg: MotivationConfig = {
  weights: { survival: 1, resources: 1, curiosity: 1, shelter: 1, social: 1 },
  curiosityDecayPerMs: 0.001, // 0.1/100ms
  starvationBoostPerMs: 0.0001,
  goalThreshold: 0.5,
  hysteresisMargin: 0.1,
  survivalCriticalThreshold: 0.25,
  resourceTargets: ['oak_log', 'cobblestone'],
}

// WorldSnapshot mínimo: só os campos que evaluateNeeds lê (status + inventory).
function snapshot(opts: {
  health?: number
  food?: number
  inventory?: Array<{ name: string; count: number }>
}): WorldSnapshot {
  return {
    status: { health: opts.health ?? 20, food: opts.food ?? 20 },
    inventory: (opts.inventory ?? []).map((s, i) => ({ slot: i, name: s.name, count: s.count })),
  } as unknown as WorldSnapshot
}

// --- createNeeds ---

test('createNeeds inicializa as 5 needs satisfeitas (value 1) com lastSatisfiedAt = now', () => {
  const needs = createNeeds(1000)
  expect(needs).toHaveLength(5)
  for (const n of needs) {
    expect(n.value).toBe(1)
    expect(n.lastSatisfiedAt).toBe(1000)
  }
  const kinds = needs.map((n) => n.kind).sort()
  expect(kinds).toEqual([...ACTIVE_NEEDS, ...STUB_NEEDS].sort())
})

// --- evaluateNeeds: survival (híbrido D-09, do snapshot) ---

test('survival = média de health/20 e food/20 do snapshot', () => {
  const prev = createNeeds(0)
  const out = evaluateNeeds(prev, snapshot({ health: 10, food: 20 }), 1000, cfg)
  const survival = out.find((n) => n.kind === 'survival')!
  // (10/20 + 20/20)/2 = (0.5 + 1)/2 = 0.75
  expect(survival.value).toBeCloseTo(0.75, 6)
})

test('survival reflete dano: health/food baixos -> value baixo', () => {
  const prev = createNeeds(0)
  const out = evaluateNeeds(prev, snapshot({ health: 4, food: 6 }), 1000, cfg)
  const survival = out.find((n) => n.kind === 'survival')!
  expect(survival.value).toBeCloseTo((4 / 20 + 6 / 20) / 2, 6)
})

// --- evaluateNeeds: resources (híbrido D-09, do inventário) ---

test('resources = fração de resourceTargets presentes no inventário', () => {
  const prev = createNeeds(0)
  // 1 de 2 targets presente -> 0.5
  const out = evaluateNeeds(prev, snapshot({ inventory: [{ name: 'oak_log', count: 3 }] }), 1000, cfg)
  const resources = out.find((n) => n.kind === 'resources')!
  expect(resources.value).toBeCloseTo(0.5, 6)
})

test('resources = 1 quando todos os targets presentes', () => {
  const prev = createNeeds(0)
  const out = evaluateNeeds(
    prev,
    snapshot({ inventory: [{ name: 'oak_log', count: 1 }, { name: 'cobblestone', count: 1 }] }),
    1000,
    cfg,
  )
  expect(out.find((n) => n.kind === 'resources')!.value).toBeCloseTo(1, 6)
})

test('resources = 0 quando nenhum target presente', () => {
  const prev = createNeeds(0)
  const out = evaluateNeeds(prev, snapshot({ inventory: [{ name: 'dirt', count: 64 }] }), 1000, cfg)
  expect(out.find((n) => n.kind === 'resources')!.value).toBeCloseTo(0, 6)
})

// --- evaluateNeeds: curiosity (timer D-09) ---

test('curiosity decai por timer desde lastSatisfiedAt', () => {
  const prev: Need[] = createNeeds(0)
  // value inicial 1, decai 0.001/ms * 200ms = 0.2 -> 0.8
  const out = evaluateNeeds(prev, snapshot({}), 200, cfg)
  expect(out.find((n) => n.kind === 'curiosity')!.value).toBeCloseTo(0.8, 6)
})

test('curiosity satura em 0 (não fica negativa)', () => {
  const prev = createNeeds(0)
  const out = evaluateNeeds(prev, snapshot({}), 100000, cfg)
  expect(out.find((n) => n.kind === 'curiosity')!.value).toBe(0)
})

// --- evaluateNeeds: shelter/social stub (D-08) ---

test('shelter e social permanecem inalterados (stub — sem decaimento)', () => {
  const prev = createNeeds(0)
  const out = evaluateNeeds(prev, snapshot({ health: 1, food: 1 }), 50000, cfg)
  const shelter = out.find((n) => n.kind === 'shelter')!
  const social = out.find((n) => n.kind === 'social')!
  expect(shelter.value).toBe(1)
  expect(social.value).toBe(1)
})

// --- urgency: anti-starvation monotônico (NEED-02/D-11) ---

test('urgency cresce monotonicamente com o tempo desde lastSatisfiedAt', () => {
  const n: Need = { kind: 'curiosity', value: 0.5, lastSatisfiedAt: 0 }
  const u1 = urgency(n, 1000, cfg)
  const u2 = urgency(n, 2000, cfg)
  const u3 = urgency(n, 5000, cfg)
  expect(u2).toBeGreaterThan(u1)
  expect(u3).toBeGreaterThan(u2)
})

test('urgency = weights[kind] * ((1-value) + starvationBoostPerMs * ignoredMs)', () => {
  const n: Need = { kind: 'survival', value: 0.4, lastSatisfiedAt: 100 }
  // weight 1 * ((1-0.4) + 0.0001 * (1100-100)) = 0.6 + 0.1 = 0.7
  expect(urgency(n, 1100, cfg)).toBeCloseTo(0.7, 6)
})

test('urgency pondera por weights[kind]', () => {
  const heavy: MotivationConfig = { ...cfg, weights: { ...cfg.weights, survival: 2 } }
  const n: Need = { kind: 'survival', value: 0.5, lastSatisfiedAt: 0 }
  const base = urgency(n, 1000, cfg)
  const weighted = urgency(n, 1000, heavy)
  expect(weighted).toBeCloseTo(base * 2, 6)
})
