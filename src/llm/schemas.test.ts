// src/llm/schemas.test.ts
// LLM-02 / CHAT-03: schema de decisão com enum FECHADO + persona prompt por disposição.
import { test, expect } from 'bun:test'
import { ActionDecisionSchema, ReflectionOutputSchema } from './schemas'
import { buildPersonaPrompt, serializeContext } from './prompts'
import type { WorldSnapshot } from '../perception/types'
import type { MemEvent } from '../cognition/types'

// === ActionDecisionSchema: enum FECHADO (LLM-02) ===

test('ActionDecisionSchema rejeita action fora do enum fechado', () => {
  expect(() =>
    ActionDecisionSchema.parse({ action: 'fly', reason: 'voar para longe' }),
  ).toThrow()
})

test('ActionDecisionSchema aceita action válida do enum (gather)', () => {
  const d = ActionDecisionSchema.parse({ action: 'gather', target: 'oak_log', reason: 'preciso de madeira' })
  expect(d.action).toBe('gather')
  expect(d.target).toBe('oak_log')
})

test('ActionDecisionSchema aceita todas as ações do enum', () => {
  for (const action of ['gather', 'explore', 'navigate', 'idle', 'chat'] as const) {
    const d = ActionDecisionSchema.parse({ action, reason: 'ok' })
    expect(d.action).toBe(action)
  }
})

// === G-01: enum estendido com craft/smelt/equip/place (continua FECHADO) ===

test('ActionDecisionSchema aceita craft/smelt/equip/place (G-01)', () => {
  for (const action of ['craft', 'smelt', 'equip', 'place'] as const) {
    const d = ActionDecisionSchema.parse({ action, target: 'x', reason: 'ok' })
    expect(d.action).toBe(action)
  }
})

test('ActionDecisionSchema aceita craft com target item:N', () => {
  const d = ActionDecisionSchema.parse({ action: 'craft', target: 'wooden_pickaxe:1', reason: 'preciso de picareta' })
  expect(d.action).toBe('craft')
  expect(d.target).toBe('wooden_pickaxe:1')
})

test('ActionDecisionSchema aceita place com target "nome @ x,y,z"', () => {
  const d = ActionDecisionSchema.parse({ action: 'place', target: 'crafting_table @ 10,64,-3', reason: 'montar mesa' })
  expect(d.action).toBe('place')
  expect(d.target).toBe('crafting_table @ 10,64,-3')
})

test('ActionDecisionSchema continua FECHADO após estender (rejeita mine_diamonds)', () => {
  expect(() =>
    ActionDecisionSchema.parse({ action: 'mine_diamonds', target: 'x', reason: 'cavar' }),
  ).toThrow()
})

test('ActionDecisionSchema exige reason', () => {
  expect(() => ActionDecisionSchema.parse({ action: 'idle' })).toThrow()
})

test('ActionDecisionSchema: target é opcional', () => {
  const d = ActionDecisionSchema.parse({ action: 'idle', reason: 'nada a fazer' })
  expect(d.target).toBeUndefined()
})

test('ActionDecisionSchema rejeita target maior que 64 chars', () => {
  expect(() =>
    ActionDecisionSchema.parse({ action: 'navigate', target: 'x'.repeat(65), reason: 'ir' }),
  ).toThrow()
})

test('ActionDecisionSchema rejeita reason maior que 200 chars', () => {
  expect(() =>
    ActionDecisionSchema.parse({ action: 'idle', reason: 'r'.repeat(201) }),
  ).toThrow()
})

// === ReflectionOutputSchema: parse lenient no priority (quick 260621-jhi) ===

test('ReflectionOutputSchema: priority fora de [0,1] NÃO derruba o parse e summary sobrevive', () => {
  const out = ReflectionOutputSchema.parse({
    summary: 'resumo válido',
    goalUpdates: [{ id: 'g1', action: 'reprioritize', priority: 10 }],
  })
  expect(out.summary).toBe('resumo válido')
  expect(out.goalUpdates[0]!.priority).toBe(10)
})

// === buildPersonaPrompt: persona estática por disposição (CHAT-03 / D-01/D-02/D-06) ===

test('buildPersonaPrompt difere entre AUTONOMOUS e ASSISTANT (D-06)', () => {
  const autonomous = buildPersonaPrompt('AUTONOMOUS')
  const assistant = buildPersonaPrompt('ASSISTANT')
  expect(autonomous).not.toBe(assistant)
  expect(autonomous.length).toBeGreaterThan(0)
  expect(assistant.length).toBeGreaterThan(0)
})

test('ambos os prompts contêm a instrução de espelhar o idioma do interlocutor (D-02)', () => {
  const autonomous = buildPersonaPrompt('AUTONOMOUS').toLowerCase()
  const assistant = buildPersonaPrompt('ASSISTANT').toLowerCase()
  expect(autonomous).toContain('idioma')
  expect(assistant).toContain('idioma')
})

test('ambos os prompts contêm o arquétipo "sobrevivente pragmático" (D-01)', () => {
  expect(buildPersonaPrompt('AUTONOMOUS').toLowerCase()).toContain('sobrevivente')
  expect(buildPersonaPrompt('ASSISTANT').toLowerCase()).toContain('sobrevivente')
})

// === serializeContext: compacto e tolerante (D-07) ===

function emptySnapshot(): WorldSnapshot {
  return {
    capturedAt: 0,
    status: { health: 20, food: 18, position: { x: 0, y: 64, z: 0 }, timeOfDay: 0.2, isDay: true },
    entities: [],
    players: [],
    nearbyBlockTypes: {},
    inventory: [],
    lookingAt: null,
    underfoot: 'unknown',
  }
}

test('serializeContext não lança com snapshot null e arrays vazios', () => {
  expect(() => serializeContext(null, undefined, undefined, [])).not.toThrow()
  const s = serializeContext(null, undefined, undefined, [])
  expect(typeof s).toBe('string')
})

test('serializeContext inclui health/food do snapshot', () => {
  const s = serializeContext(emptySnapshot(), undefined, undefined, [])
  expect(s).toContain('20')
  expect(s).toContain('18')
})

test('serializeContext inclui eventos recentes de memória', () => {
  const events: MemEvent[] = [
    { type: 'world', event: 'damage', detail: 'levou dano de zombie', timestamp: 1 },
  ]
  const s = serializeContext(emptySnapshot(), undefined, undefined, events)
  expect(s).toContain('damage')
})

test('serializeContext inclui tipos de bloco próximos com count', () => {
  const snap: WorldSnapshot = {
    ...emptySnapshot(),
    nearbyBlockTypes: { oak_log: { count: 5, examples: [{ x: 1, y: 64, z: 1 }] } },
  }
  const s = serializeContext(snap, undefined, undefined, [])
  expect(s).toContain('oak_log')
  expect(s).toContain('5')
})
