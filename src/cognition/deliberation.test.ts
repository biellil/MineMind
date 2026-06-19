// src/cognition/deliberation.test.ts
// COG-03/D-19: deliberação single-flight, event-driven, com orçamento de replanejamento,
// FORA do grafo, usando o arbiter como fallback (D-17). Sem rede (provider MOCK).
import { test, expect, mock } from 'bun:test'
import { createDeliberator, shouldTrigger, type DeliberationState } from './deliberation'
import { createCognitiveStateHolder } from './state'
import type { LlmProvider } from '../llm/provider'
import type { ActionDecision } from '../llm/schemas'
import type { WorldSnapshot } from '../perception/types'
import { config } from '../config'

// Snapshot mock mínimo — mundo vazio (arbiter cai em 'exploring').
function mockSnapshot(): WorldSnapshot {
  return {
    capturedAt: 0,
    status: { health: 20, food: 20, position: { x: 0, y: 64, z: 0 }, timeOfDay: 0.1, isDay: true },
    entities: [],
    players: [],
    nearbyBlockTypes: {},
    inventory: [],
  }
}

// Provider que sempre devolve uma decisão fixa via decide (e available=true).
function okProvider(decision: ActionDecision): LlmProvider {
  return {
    decide: mock(async () => decision as never),
    chat: mock(async () => ''),
    available: mock(async () => true),
    embed: mock(async () => []),
  }
}

const freshState = (over: Partial<DeliberationState> = {}): DeliberationState => ({
  inFlight: false,
  lastRunAt: -1e12, // bem no passado → orçamento de replan não bloqueia
  ...over,
})

test('single-flight: com inFlight=true não chama o provider', async () => {
  const holder = createCognitiveStateHolder()
  const provider = okProvider({ action: 'explore', reason: 'x' })
  const { maybeDeliberate } = createDeliberator()
  const state = freshState({ inFlight: true })
  await maybeDeliberate(state, holder, provider, mockSnapshot(), 'periodic', Date.now())
  expect((provider.available as ReturnType<typeof mock>).mock.calls.length).toBe(0)
  expect(holder.llmDecision).toBeNull()
})

test('orçamento de replan: dentro de replanMinIntervalMs não dispara', async () => {
  const holder = createCognitiveStateHolder()
  const provider = okProvider({ action: 'explore', reason: 'x' })
  const { maybeDeliberate } = createDeliberator()
  const now = 1_000_000
  const state = freshState({ lastRunAt: now - (config.replanMinIntervalMs - 1) })
  await maybeDeliberate(state, holder, provider, mockSnapshot(), 'goal_changed', now)
  expect((provider.available as ReturnType<typeof mock>).mock.calls.length).toBe(0)
  expect(holder.llmDecision).toBeNull()
})

test('shouldTrigger=false: não dispara', async () => {
  const holder = createCognitiveStateHolder()
  holder.disposition = 'AUTONOMOUS' // chat em AUTONOMOUS não dispara (D-07)
  const provider = okProvider({ action: 'chat', reason: 'x' })
  const { maybeDeliberate } = createDeliberator()
  await maybeDeliberate(freshState(), holder, provider, mockSnapshot(), 'chat', Date.now())
  expect((provider.available as ReturnType<typeof mock>).mock.calls.length).toBe(0)
  expect(holder.llmDecision).toBeNull()
})

test('dispara: grava holder.llmDecision com a decisão e timestamp', async () => {
  const holder = createCognitiveStateHolder()
  const decision: ActionDecision = { action: 'gather', target: 'oak_log', reason: 'preciso de madeira' }
  const provider = okProvider(decision)
  const { maybeDeliberate } = createDeliberator()
  const now = 5_000_000
  await maybeDeliberate(freshState(), holder, provider, mockSnapshot(), 'need_threshold', now)
  expect(holder.llmDecision).not.toBeNull()
  expect(holder.llmDecision!.decision.action).toBe('gather')
  expect(holder.llmDecision!.at).toBe(now)
})

test('inFlight é resetado após disparar (finally)', async () => {
  const holder = createCognitiveStateHolder()
  const provider = okProvider({ action: 'idle', reason: 'x' })
  const { maybeDeliberate } = createDeliberator()
  const state = freshState()
  await maybeDeliberate(state, holder, provider, mockSnapshot(), 'goal_changed', Date.now())
  expect(state.inFlight).toBe(false)
})

test('fallback ao arbiter: LLM off (available=false) ainda grava uma decisão', async () => {
  const holder = createCognitiveStateHolder()
  const provider: LlmProvider = {
    decide: mock(async () => ({}) as never),
    chat: mock(async () => ''),
    embed: mock(async () => []),
    available: mock(async () => false), // off → decideAction usa o fallback (arbiter)
  }
  const { maybeDeliberate } = createDeliberator()
  await maybeDeliberate(freshState(), holder, provider, mockSnapshot(), 'goal_changed', Date.now())
  // decide nunca foi chamado (LLM off), mas a decisão veio do arbiter (fallback D-17)
  expect((provider.decide as ReturnType<typeof mock>).mock.calls.length).toBe(0)
  expect(holder.llmDecision).not.toBeNull()
  // mundo vazio → arbiter exploring → action 'explore'
  expect(holder.llmDecision!.decision.action).toBe('explore')
  expect(holder.llmDecision!.decision.reason).toContain('arbiter')
})

test('shouldTrigger: chat só dispara em ASSISTANT (D-07)', () => {
  const auto = createCognitiveStateHolder()
  auto.disposition = 'AUTONOMOUS'
  const assist = createCognitiveStateHolder()
  assist.disposition = 'ASSISTANT'
  expect(shouldTrigger('chat', auto)).toBe(false)
  expect(shouldTrigger('chat', assist)).toBe(true)
  expect(shouldTrigger('goal_changed', auto)).toBe(true)
  expect(shouldTrigger('need_threshold', auto)).toBe(true)
})

test('single-flight concorrente: segunda chamada durante a primeira não redispara', async () => {
  const holder = createCognitiveStateHolder()
  let resolveDecide!: (v: ActionDecision) => void
  const provider: LlmProvider = {
    decide: mock(() => new Promise<never>((res) => { resolveDecide = res as never })),
    chat: mock(async () => ''),
    embed: mock(async () => []),
    available: mock(async () => true),
  }
  const { maybeDeliberate } = createDeliberator()
  const state: DeliberationState = freshState()
  const snap = mockSnapshot()
  const first = maybeDeliberate(state, holder, provider, snap, 'goal_changed', 1000)
  // enquanto a 1ª está pendente (inFlight=true), a 2ª deve retornar sem nova chamada a available
  await maybeDeliberate(state, holder, provider, snap, 'goal_changed', 1001)
  expect((provider.available as ReturnType<typeof mock>).mock.calls.length).toBe(1)
  resolveDecide({ action: 'idle', reason: 'done' })
  await first
  expect(state.inFlight).toBe(false)
})
