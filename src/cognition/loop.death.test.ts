// src/cognition/loop.death.test.ts
// Quick 260619-rv8 / Task 3: prova as PEÇAS do ciclo de vida na morte/void, no espírito do smoke
// (sem subir o while real, que é fire-and-forget interno). Cobre CR#1 (tick não derruba na morte) e
// CR#3 (poda do checkpointer é chamável e não lança). A parada por deadTicks é uma propriedade do
// driver (loop.ts) montada sobre estas duas peças.
import { test, expect } from 'bun:test'
import { buildGraph } from './graph'
import { createCognitiveStateHolder } from './state'
import type { LlmProvider } from '../llm/provider'

// O grafo NÃO chama o LLM no tick — provider stub que nunca é usado.
const stubProvider: LlmProvider = {
  decide: async () => ({}) as never,
  chat: async () => '',
  available: async () => false,
  embed: async () => [],
}

// Mock de bot VIVO (entity presente) — base do smoke/reconnect.
function makeMockBot(): any {
  const pos = { x: 0, y: 64, z: 0, distanceTo: (_o: any) => 0, offset: (_dx: any, _dy: any, _dz: any) => pos }
  return {
    username: 'MineMind',
    health: 20,
    food: 20,
    entity: { position: pos },
    time: { timeOfDay: 1000 },
    entities: {},
    players: {},
    inventory: { items: () => [] },
    findBlocks: () => [],
    blockAt: () => null,
    blockAtCursor: () => null,
    findBlock: () => null,
    pathfinder: { goto: async () => {} },
    on: () => {},
    once: () => {},
  }
}

// Mock de bot MORTO/void: bot.entity === undefined (Mineflayer zera o corpo na morte/queda).
function makeDeadMockBot(): any {
  const bot = makeMockBot()
  bot.entity = undefined
  return bot
}

const cfg = (thread_id: string) => ({ configurable: { thread_id } })

test('CR#1: invoke com bot SEM corpo (morte/void) resolve com snapshot === null e NÃO rejeita', async () => {
  const bot = makeDeadMockBot()
  const { graph } = buildGraph({ bot, holder: createCognitiveStateHolder(), provider: stubProvider })
  // Não deve lançar: a percepção é defensiva (Task 1/2) e observe degrada para { snapshot: null }.
  const last = await graph.invoke({}, cfg('death-s1'))
  expect(last).toBeDefined()
  expect(last.snapshot).toBeNull()
  // analyze degrada para idle quando não há snapshot.
  expect(last.cogState).toBe('idle')
}, 10_000)

test('CR#3: checkpointer.deleteThread resolve sem lançar após alguns invokes (poda chamável)', async () => {
  const bot = makeMockBot()
  const { graph, checkpointer } = buildGraph({ bot, holder: createCognitiveStateHolder(), provider: stubProvider })
  for (let i = 0; i < 3; i++) await graph.invoke({}, cfg('minemind-agent'))
  // A poda do thread fixo não deve lançar — é o lever do CR#3 contra o vazamento de RAM.
  await expect(checkpointer.deleteThread('minemind-agent')).resolves.toBeUndefined()
}, 10_000)
