// src/cognition/deliberation.test.ts
// Phase 10.1-02 / D-01/D-04/D-05/D-13: deliberação sob gate-por-tipo + semáforo (substitui o
// inFlight booleano único). Cobre: gate por tipo (não sobrepõe o mesmo tipo, tipos independentes),
// semáforo (serialização com permits=1, coexistência com permits>=2), commit síncrono merge-by-id
// que protege um goal de player empurrado DURANTE o await da reflexão (clobber — o coração da fase),
// e release/leave no finally em todos os caminhos (sem permit/gate leak). Sem rede (provider MOCK).
import { test, expect, mock } from 'bun:test'
import { createDeliberator, shouldTrigger, type DeliberationState } from './deliberation'
import { Semaphore, createTaskGate } from './concurrency'
import { createCognitiveStateHolder } from './state'
import type { LlmProvider } from '../llm/provider'
import type { ActionDecision } from '../llm/schemas'
import type { WorldSnapshot } from '../perception/types'
import type { Goal } from '../motivation/types'
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
    lookingAt: null,
    underfoot: 'unknown',
  }
}

// Provider que sempre devolve uma decisão fixa via decide (e available=true).
function okProvider(decision: ActionDecision): LlmProvider {
  return {
    maxConcurrency: 1,
    decide: mock(async () => decision as never),
    chat: mock(async () => ''),
    available: mock(async () => true),
    embed: mock(async () => []),
  }
}

const freshState = (over: Partial<DeliberationState> = {}): DeliberationState => ({
  lastRunAt: -1e12, // bem no passado → orçamento de replan não bloqueia
  ...over,
})

// Dependências de concorrência por teste: gate por tipo + semáforo (permits configurável).
const freshDeps = (permits = 1): { gate: ReturnType<typeof createTaskGate>; semaphore: Semaphore } => ({
  gate: createTaskGate(),
  semaphore: new Semaphore(permits),
})

test('gate por tipo: reflection busy → reflect não dispara (return false)', async () => {
  const holder = createCognitiveStateHolder()
  const provider = okProvider({ action: 'explore', reason: 'x' })
  const { maybeDeliberate } = createDeliberator()
  const { gate, semaphore } = freshDeps()
  gate.tryEnter('reflection') // simula uma reflexão já em voo
  const ran = await maybeDeliberate(freshState(), holder, provider, mockSnapshot(), 'reflect', Date.now(), null, gate, semaphore)
  expect(ran).toBe(false)
})

test('gate por tipo: action busy mas reflection livre → reflect AINDA dispara (tipos independentes D-01)', async () => {
  const holder = createCognitiveStateHolder()
  const provider = okProvider({ action: 'idle', reason: 'x' })
  const { maybeDeliberate } = createDeliberator()
  const { gate, semaphore } = freshDeps()
  gate.tryEnter('action') // ação em voo NÃO bloqueia a reflexão (deixou de ser XOR)
  const ran = await maybeDeliberate(freshState(), holder, provider, mockSnapshot(), 'reflect', Date.now(), null, gate, semaphore)
  expect(ran).toBe(true)
})

test('orçamento de replan: dentro de replanMinIntervalMs não dispara (só caminho de AÇÃO)', async () => {
  const holder = createCognitiveStateHolder()
  const provider = okProvider({ action: 'explore', reason: 'x' })
  const { maybeDeliberate } = createDeliberator()
  const { gate, semaphore } = freshDeps()
  const now = 1_000_000
  const state = freshState({ lastRunAt: now - (config.replanMinIntervalMs - 1) })
  await maybeDeliberate(state, holder, provider, mockSnapshot(), 'goal_changed', now, null, gate, semaphore)
  expect((provider.available as ReturnType<typeof mock>).mock.calls.length).toBe(0)
  expect(holder.llmDecision).toBeNull()
  // o gate de action deve ter sido liberado (orçamento estourado libera o gate)
  expect(gate.isBusy('action')).toBe(false)
})

test('shouldTrigger=false: não dispara e libera o gate', async () => {
  const holder = createCognitiveStateHolder()
  holder.disposition = 'AUTONOMOUS' // chat em AUTONOMOUS não dispara (D-07)
  const provider = okProvider({ action: 'chat', reason: 'x' })
  const { maybeDeliberate } = createDeliberator()
  const { gate, semaphore } = freshDeps()
  await maybeDeliberate(freshState(), holder, provider, mockSnapshot(), 'chat', Date.now(), null, gate, semaphore)
  expect((provider.available as ReturnType<typeof mock>).mock.calls.length).toBe(0)
  expect(holder.llmDecision).toBeNull()
  expect(gate.isBusy('action')).toBe(false)
})

test('dispara: grava holder.llmDecision com a decisão e timestamp', async () => {
  const holder = createCognitiveStateHolder()
  const decision: ActionDecision = { action: 'gather', target: 'oak_log', reason: 'preciso de madeira' }
  const provider = okProvider(decision)
  const { maybeDeliberate } = createDeliberator()
  const { gate, semaphore } = freshDeps()
  const now = 5_000_000
  await maybeDeliberate(freshState(), holder, provider, mockSnapshot(), 'need_threshold', now, null, gate, semaphore)
  expect(holder.llmDecision).not.toBeNull()
  expect(holder.llmDecision!.decision.action).toBe('gather')
  expect(holder.llmDecision!.at).toBe(now)
})

test('finally libera gate e semáforo após disparar (sem leak)', async () => {
  const holder = createCognitiveStateHolder()
  const provider = okProvider({ action: 'idle', reason: 'x' })
  const { maybeDeliberate } = createDeliberator()
  const { gate, semaphore } = freshDeps(1)
  const state = freshState()
  await maybeDeliberate(state, holder, provider, mockSnapshot(), 'goal_changed', Date.now(), null, gate, semaphore)
  expect(gate.isBusy('action')).toBe(false)
  // o semáforo deve estar livre de novo: um acquire imediato resolve sem pendurar.
  let acquired = false
  await semaphore.acquire(1).then(() => { acquired = true })
  expect(acquired).toBe(true)
  semaphore.release()
})

test('finally libera gate e semáforo mesmo quando a seção crítica lança (Pitfall 3)', async () => {
  const holder = createCognitiveStateHolder()
  const provider: LlmProvider = {
    maxConcurrency: 1,
    // decide lança DENTRO da seção crítica do caminho de AÇÃO (via decideAction→provider.decide).
    // decideAction nunca lança (usa fallback), então forçamos o throw em available para o caminho action.
    decide: mock(async () => ({ action: 'idle', reason: 'x' }) as never),
    chat: mock(async () => ''),
    embed: mock(async () => []),
    available: mock(async () => { throw new Error('boom dentro da seção crítica') }),
  }
  const { maybeDeliberate } = createDeliberator()
  const { gate, semaphore } = freshDeps(1)
  let threw = false
  try {
    await maybeDeliberate(freshState(), holder, provider, mockSnapshot(), 'goal_changed', Date.now(), null, gate, semaphore)
  } catch {
    threw = true
  }
  expect(threw).toBe(true)
  // mesmo com throw, o gate e o semáforo voltaram livres
  expect(gate.isBusy('action')).toBe(false)
  let acquired = false
  await semaphore.acquire(1).then(() => { acquired = true })
  expect(acquired).toBe(true)
  semaphore.release()
})

test('semáforo permits=1: 2ª aquisição aguarda o release da 1ª (serialização D-03)', async () => {
  const holder = createCognitiveStateHolder()
  let resolveDecide!: (v: ActionDecision) => void
  const provider: LlmProvider = {
    maxConcurrency: 1,
    decide: mock(() => new Promise<never>((res) => { resolveDecide = res as never })),
    chat: mock(async () => ''),
    embed: mock(async () => []),
    available: mock(async () => true),
  }
  const { gate, semaphore } = freshDeps(1)
  // ocupa o único permit fora da deliberação (simula outra tarefa segurando o slot)
  await semaphore.acquire(1)

  const { maybeDeliberate } = createDeliberator()
  const promise = maybeDeliberate(freshState(), holder, provider, mockSnapshot(), 'goal_changed', 1000, null, gate, semaphore)
  // drena microtasks: a deliberação passou pelo gate mas está PENDURADA no acquire (permit esgotado)
  await Promise.resolve()
  await Promise.resolve()
  expect((provider.decide as ReturnType<typeof mock>).mock.calls.length).toBe(0) // ainda não chamou o provider

  // libera o slot → a deliberação adquire e percorre embed/retrieve/available até chegar ao provider.
  semaphore.release()
  // drena várias microtasks: o caminho de AÇÃO faz computeGoalQueryEmbedding + retrieve + available
  // ANTES de decideAction→provider.decide.
  for (let i = 0; i < 10; i++) await Promise.resolve()
  expect((provider.decide as ReturnType<typeof mock>).mock.calls.length).toBe(1)

  resolveDecide({ action: 'idle', reason: 'done' })
  await promise
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

test('fallback ao arbiter: LLM off (available=false) ainda grava uma decisão', async () => {
  const holder = createCognitiveStateHolder()
  const provider: LlmProvider = {
    maxConcurrency: 1,
    decide: mock(async () => ({}) as never),
    chat: mock(async () => ''),
    embed: mock(async () => []),
    available: mock(async () => false), // off → decideAction usa o fallback (arbiter)
  }
  const { maybeDeliberate } = createDeliberator()
  const { gate, semaphore } = freshDeps()
  await maybeDeliberate(freshState(), holder, provider, mockSnapshot(), 'goal_changed', Date.now(), null, gate, semaphore)
  expect((provider.decide as ReturnType<typeof mock>).mock.calls.length).toBe(0)
  expect(holder.llmDecision).not.toBeNull()
  expect(holder.llmDecision!.decision.action).toBe('explore')
  expect(holder.llmDecision!.decision.reason).toContain('arbiter')
})

// === O CORAÇÃO DA FASE: clobber de holder.goals (D-05/D-06/Pitfall 2) ===
// Constrói o goal player_request INLINE (literal equivalente a makePlayerRequestGoal — que é uma
// `function` LOCAL não-exportada de chat/conversation.ts; importá-la NÃO compila).
test('clobber: goal player_request empurrado DURANTE o await da reflexão sobrevive ao commit', async () => {
  const holder = createCognitiveStateHolder()
  const now = 7_000_000

  // Um goal pré-existente que a reflexão vai DROPAR — prova que o merge-by-id age (drop dos conhecidos,
  // preserva os desconhecidos como o player_request empurrado durante o await).
  const existingGoal: Goal = {
    id: 'existing:gather:1',
    kind: 'gather',
    priority: 0.5,
    progress: 0,
    dependsOn: [],
    source: 'self',
    committedAt: 1,
  } as unknown as Goal
  holder.goals = [existingGoal]

  let resolveDecide!: (v: unknown) => void
  const provider: LlmProvider = {
    maxConcurrency: 1,
    // decide da reflexão PENDURA até resolveDecide — a janela do clobber.
    decide: mock(() => new Promise<never>((res) => { resolveDecide = res as never })),
    chat: mock(async () => ''),
    // a reflexão dropa o existingGoal (ramo 'drop' do applyGoalUpdates).
    embed: mock(async () => []),
    available: mock(async () => true),
  }

  const { maybeDeliberate } = createDeliberator()
  const { gate, semaphore } = freshDeps()
  const promise = maybeDeliberate(freshState(), holder, provider, mockSnapshot(), 'reflect', now, null, gate, semaphore)

  // drena microtasks → a reflexão chegou ao await provider.decide (PENDURADO).
  await Promise.resolve()
  await Promise.resolve()

  // DURANTE o await: a CONVERSA empurra um goal player_request (literal == makePlayerRequestGoal).
  holder.goals.push({
    id: `player_request:gather:${now}`,
    kind: 'gather',
    priority: 1,
    progress: 0,
    dependsOn: [],
    source: 'player_request',
    committedAt: now,
  } as unknown as Goal)

  // resolve a reflexão: ela dropa o existingGoal. O commit DEVE re-ler holder.goals (pós-push).
  resolveDecide({ summary: 'refleti', goalUpdates: [{ id: 'existing:gather:1', action: 'drop' }] })
  await promise

  // o goal de player SOBREVIVEU ao commit da reflexão (não foi clobberado).
  const survived = holder.goals.find((g) => g.id === `player_request:gather:${now}`)
  expect(survived).toBeDefined()
  expect(survived!.source).toBe('player_request')
  // e o existingGoal foi de fato dropado pela reflexão (merge-by-id agiu sobre o array ATUAL).
  expect(holder.goals.find((g) => g.id === 'existing:gather:1')).toBeUndefined()
})
