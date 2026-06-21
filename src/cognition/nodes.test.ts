// src/cognition/nodes.test.ts
// G-01 (09-05): teste agent-level do dispatch dos 4 verbos novos (craft/smelt/equip/place).
// Prova que, dada uma decisão LLM fresca, o execute node despacha skillRegistry.{craft,smelt,equip,
// placeBlock} com params físicos montados do target e grava MemEvent grounded (outcome do SkillResult).
//
// Convenção de injeção SEM mock.module (vaza global no bun — ver __craftDeps em craft.ts): o teste
// monkeypatcha pontualmente as entradas do objeto skillRegistry importado e restaura no afterEach.
import { test, expect, afterEach } from 'bun:test'
import { createNodes, type LoopState, type NodeDeps } from './nodes'
import { createCognitiveStateHolder, type CognitiveStateHolder } from './state'
import { TriggerBus } from './trigger-bus'
import { skillRegistry, type SkillFunction } from '../skills/index'
import { createMemory } from '../memory/shortTerm'
import type { SkillResult, SkillOutcome } from '../grounding/types'
import type { WorldSnapshot } from '../perception/types'
import type { ActionDecision } from '../llm/schemas'
import type { LlmProvider } from '../llm/provider'

// provider stub — execute não o usa.
const stubProvider: LlmProvider = {
  decide: async () => ({}) as never,
  chat: async () => '',
  available: async () => false,
  embed: async () => [],
}

// Mock mínimo de Bot — execute lê s.snapshot (não chama buildWorldSnapshot); pathfinder.setGoal é
// usado nos listeners de preempção. Inventário/registry não são tocados (skills estão mockadas).
function makeMockBot(): any {
  return {
    username: 'MineMind',
    pathfinder: { setGoal: () => {} },
    on: () => {},
    once: () => {},
  }
}

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

// Estado de loop em 'building' com snapshot válido (o branch novo dispara em state==='building').
function buildingState(): LoopState {
  return {
    snapshot: emptySnapshot(),
    cogState: 'building',
    memory: createMemory(2000),
    needs: [],
    goals: [],
    currentGoal: null,
    disposition: 'AUTONOMOUS',
    enteredIdle: false,
    nextWakeMs: 0,
  }
}

// Monta o holder com a decisão LLM fresca sob teste (at=now passa o gate de frescor).
function makeHolder(decision: ActionDecision): CognitiveStateHolder {
  const holder = createCognitiveStateHolder()
  holder.llmDecision = { decision, at: Date.now() }
  return holder
}

function makeDeps(holder: CognitiveStateHolder, triggerBus: TriggerBus): NodeDeps {
  return { bot: makeMockBot(), holder, provider: stubProvider, triggerBus }
}

// Captura os args com que uma skill do registry foi chamada, retornando um SkillResult fixo.
type Capture = { calledWith: any | null }
function patchSkill(name: string, result: SkillResult): Capture {
  const cap: Capture = { calledWith: null }
  const mock: SkillFunction = async (_bot, params) => {
    cap.calledWith = params
    return result
  }
  skillRegistry[name] = mock
  return cap
}

const fixed = (outcome: SkillOutcome, observed = 1, expected = 1): SkillResult => ({
  outcome,
  observed,
  expected,
  delta: {},
})

// Restaura o registry real após cada teste (monkeypatch pontual — NÃO mock.module).
const original: Record<string, SkillFunction> = {
  craft: skillRegistry.craft!,
  smelt: skillRegistry.smelt!,
  equip: skillRegistry.equip!,
  placeBlock: skillRegistry.placeBlock!,
}
afterEach(() => {
  skillRegistry.craft = original.craft
  skillRegistry.smelt = original.smelt
  skillRegistry.equip = original.equip
  skillRegistry.placeBlock = original.placeBlock
})

// Última ação gravada na memória de curto prazo do holder.
function lastActionEvent(holder: CognitiveStateHolder): any {
  const ev = holder.memory.events.filter((e: any) => e.type === 'action')
  return ev[ev.length - 1]
}

test('craft dispatch: despacha skillRegistry.craft com {itemName, count} e grava MemEvent grounded', async () => {
  const holder = makeHolder({ action: 'craft', target: 'wooden_pickaxe:1', reason: 'x' })
  const cap = patchSkill('craft', fixed('success'))
  const bus = new TriggerBus()
  const { execute } = createNodes(makeDeps(holder, bus))

  await execute(buildingState())

  expect(cap.calledWith).not.toBeNull()
  expect(cap.calledWith.itemName).toBe('wooden_pickaxe')
  expect(cap.calledWith.count).toBe(1)
  const ev = lastActionEvent(holder)
  expect(ev.skill).toBe('craft')
  expect(ev.outcome).toBe('success')
  expect(ev.result).toBe('success')
})

test('craft dispatch: target sem :N usa count=1', async () => {
  const holder = makeHolder({ action: 'craft', target: 'stick', reason: 'x' })
  const cap = patchSkill('craft', fixed('success'))
  const { execute } = createNodes(makeDeps(holder, new TriggerBus()))

  await execute(buildingState())

  expect(cap.calledWith.itemName).toBe('stick')
  expect(cap.calledWith.count).toBe(1)
})

test('smelt dispatch: despacha skillRegistry.smelt com {oreName, count}', async () => {
  const holder = makeHolder({ action: 'smelt', target: 'iron_ore', reason: 'x' })
  const cap = patchSkill('smelt', fixed('success'))
  const { execute } = createNodes(makeDeps(holder, new TriggerBus()))

  await execute(buildingState())

  expect(cap.calledWith.oreName).toBe('iron_ore')
  expect(cap.calledWith.count).toBe(1)
  expect(lastActionEvent(holder).skill).toBe('smelt')
})

test('equip dispatch: despacha skillRegistry.equip com {itemName} (sem slot)', async () => {
  const holder = makeHolder({ action: 'equip', target: 'stone_pickaxe', reason: 'x' })
  const cap = patchSkill('equip', fixed('success'))
  const { execute } = createNodes(makeDeps(holder, new TriggerBus()))

  await execute(buildingState())

  expect(cap.calledWith.itemName).toBe('stone_pickaxe')
  expect(cap.calledWith.destination).toBeUndefined()
  expect(lastActionEvent(holder).skill).toBe('equip')
})

test('equip dispatch: target "item@slot" inclui destination', async () => {
  const holder = makeHolder({ action: 'equip', target: 'iron_helmet@head', reason: 'x' })
  const cap = patchSkill('equip', fixed('success'))
  const { execute } = createNodes(makeDeps(holder, new TriggerBus()))

  await execute(buildingState())

  expect(cap.calledWith.itemName).toBe('iron_helmet')
  expect(cap.calledWith.destination).toBe('head')
})

test('place dispatch: despacha skillRegistry.placeBlock com {target:{x,y,z}, itemName}', async () => {
  const holder = makeHolder({ action: 'place', target: 'cobblestone @ 10,64,-3', reason: 'x' })
  const cap = patchSkill('placeBlock', fixed('success'))
  const { execute } = createNodes(makeDeps(holder, new TriggerBus()))

  await execute(buildingState())

  expect(cap.calledWith.target).toEqual({ x: 10, y: 64, z: -3 })
  expect(cap.calledWith.itemName).toBe('cobblestone')
  expect(lastActionEvent(holder).skill).toBe('placeBlock')
})

test('grounded memory: skill com no_effect/observed=0 grava result=failure (deriva do SkillResult, não do não-throw)', async () => {
  const holder = makeHolder({ action: 'craft', target: 'wooden_pickaxe', reason: 'x' })
  patchSkill('craft', fixed('no_effect', 0, 1))
  const { execute } = createNodes(makeDeps(holder, new TriggerBus()))

  await execute(buildingState())

  const ev = lastActionEvent(holder)
  expect(ev.outcome).toBe('no_effect')
  expect(ev.result).toBe('failure')
  expect(ev.observed).toBe(0)
})

test('place sem posição não despacha: nenhuma skill chamada, actionFinished com skill=null', async () => {
  const holder = makeHolder({ action: 'place', target: 'cobblestone', reason: 'x' }) // sem @x,y,z
  const cap = patchSkill('placeBlock', fixed('success'))
  const bus = new TriggerBus()
  let finished: any = undefined
  bus.on('actionFinished', (p: any) => { finished = p })
  const { execute } = createNodes(makeDeps(holder, bus))

  await execute(buildingState())

  expect(cap.calledWith).toBeNull() // placeBlock NÃO foi chamada
  expect(finished).toEqual({ skill: null, outcome: null })
  // nenhuma ação gravada na memória (degradou para sem-ação)
  expect(holder.memory.events.filter((e: any) => e.type === 'action').length).toBe(0)
})
