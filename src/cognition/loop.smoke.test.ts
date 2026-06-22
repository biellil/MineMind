// src/cognition/loop.smoke.test.ts
// Plano 02-04 / Task 1: smoke test headless do loop cognitivo (sem servidor MC).
// Prova NEGATIVA do Pitfall 1: o grafo finito-por-tick + driver externo cruza o
// recursionLimit de 25 super-steps SEM lancar GraphRecursionError (nao ha self-loop).
// Tambem prova: a memoria acumula entre ticks (MemorySaver + thread_id) e paused -> idle.
import { test, expect } from 'bun:test'
import { buildGraph } from './graph'
import { createCognitiveStateHolder } from './state'
import { TriggerBus } from './trigger-bus'
import type { LlmProvider } from '../llm/provider'

// O grafo NÃO chama o LLM no tick (a deliberação é fora do grafo) — provider stub que nunca é usado.
const stubProvider: LlmProvider = {
  maxConcurrency: 1,
  decide: async () => ({}) as never,
  chat: async () => '',
  available: async () => false,
  embed: async () => [],
}

// Mock MINIMO de Bot — fornece SO o que buildWorldSnapshot le (ver src/perception/snapshot.ts)
// + o que a skill navigate exercita no caminho XYZ (bot.pathfinder.goto, bot.entity.position).
// Mundo vazio (sem blocos, sem jogadores) -> arbitragem autonoma cai em 'exploring' -> navigate.
function makeMockBot(): any {
  const pos = { x: 0, y: 64, z: 0, distanceTo: (_o: any) => 0, offset: (_dx: any, _dy: any, _dz: any) => pos }
  return {
    username: 'MineMind',
    health: 20,
    food: 20,
    entity: { position: pos },
    time: { timeOfDay: 1000 }, // dia
    entities: {}, // nenhuma entidade proxima
    players: {}, // nenhum jogador -> nao dispara socializing
    inventory: { items: () => [] }, // inventario vazio
    findBlocks: () => [], // mundo sem blocos -> arbitragem cai em 'exploring'
    blockAt: () => null,
    blockAtCursor: () => null, // sem bloco na mira -> lookingAt null (enriquecimento de percepcao)
    findBlock: () => null, // navigate por nome de bloco nao e usado (execute passa XYZ)
    // navigate (caminho XYZ) chama bot.pathfinder.goto(goal); resolve imediato no mock
    pathfinder: { goto: async () => {} },
    on: () => {},
    once: () => {},
  }
}

const cfg = (thread_id: string) => ({ configurable: { thread_id } })
const makeTriggerBus = () => new TriggerBus()

test('grafo roda 26 ticks via driver externo sem GraphRecursionError (prova negativa do Pitfall 1)', async () => {
  const bot = makeMockBot()
  const { graph } = buildGraph({ bot, holder: createCognitiveStateHolder(), provider: stubProvider, triggerBus: makeTriggerBus() })
  let last: any
  // 26 > recursionLimit (25): se houvesse self-loop interno, estouraria com GraphRecursionError.
  // O ciclo aqui e o driver EXTERNO (re-invoke por tick) — cada invoke e um grafo finito ate END.
  for (let i = 0; i < 26; i++) {
    last = await graph.invoke({}, cfg('smoke'))
  }
  expect(last).toBeDefined()
  expect(last.snapshot).toBeDefined()
}, 60_000)

test('memoria acumula eventos entre ticks (MemorySaver + thread_id)', async () => {
  const bot = makeMockBot()
  const { graph } = buildGraph({ bot, holder: createCognitiveStateHolder(), provider: stubProvider, triggerBus: makeTriggerBus() })
  let last: any
  for (let i = 0; i < 5; i++) last = await graph.invoke({}, cfg('smoke-mem'))
  expect(last.memory).toBeDefined()
  expect(Array.isArray(last.memory.events)).toBe(true)
  // o no execute gravou ao menos uma acao (navigate de exploring) ao longo dos ticks
  expect(last.memory.events.length).toBeGreaterThan(0)
}, 30_000)

test('modo paused mantem o agente em idle (sem skill)', async () => {
  const bot = makeMockBot()
  const holder = createCognitiveStateHolder()
  holder.control.setMode('paused')
  const { graph } = buildGraph({ bot, holder, provider: stubProvider, triggerBus: makeTriggerBus() })
  const last = await graph.invoke({}, cfg('smoke-paused'))
  expect(last.cogState).toBe('idle')
  // paused nao dispara skill -> nenhum evento de acao registrado
  expect(last.memory.events.length).toBe(0)
}, 10_000)
