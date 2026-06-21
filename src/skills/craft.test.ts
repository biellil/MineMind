// src/skills/craft.test.ts
// Plan 09-03 / Task 2 / D-15/D-18: craft(itemName,count) resolve a receita (2x2 → bancada via
// ensureStation), aplica o gate de mesa (no_effect SEM deixar bot.craft lançar — Pitfall 4) e é
// grounded pelo delta de inventário (evaluateCraft).
//
// Mockamos './station' (ensureStation) via mock.module. O bot é mockado: registry.itemsByName,
// recipesFor (sequência por cenário), bot.craft async que muta o inventário ou lança, inventory.items
// mutável (para o captureGroundState antes/depois).
// Injeção via __craftDeps (NÃO mock.module — vaza global no bun; convenção é injeção).
import { test, expect, mock, beforeEach, afterEach } from 'bun:test'
import { craft, __craftDeps } from './craft'

const realDeps = { ...__craftDeps }
let ensureStationSpy = mock(async (_bot: any, _type: any, _signal?: any): Promise<any> => null)

interface MockItem {
  name: string
  count: number
}

/**
 * Bot mockado. inventory.items() devolve o array vivo `inv` (mutável) — bot.craft adiciona itens
 * para simular o ganho real, e o captureGroundState antes/depois lê o delta.
 */
function makeMockBot(opts: {
  inv: MockItem[]
  recipesByCall: any[][] // sequência de retornos de recipesFor (1 por chamada)
  craftBehavior?: 'add' | 'throw' | 'noop'
  craftAddName?: string
  craftAddCount?: number
}) {
  let rcall = 0
  const craftSpy = mock(async (_recipe: any, _count: number, _table: any) => {
    if (opts.craftBehavior === 'throw') throw new Error('Recipe requires craftingTable, but one was not supplied')
    if (opts.craftBehavior === 'noop') return
    // 'add': simula o ganho real no inventário
    const name = opts.craftAddName ?? 'stick'
    const cnt = opts.craftAddCount ?? 4
    const existing = opts.inv.find((i) => i.name === name)
    if (existing) existing.count += cnt
    else opts.inv.push({ name, count: cnt })
  })
  const bot: any = {
    registry: { itemsByName: { stick: { id: 280 }, crafting_table: { id: 58 }, wooden_pickaxe: { id: 270 } } },
    entity: { position: { x: 0, y: 64, z: 0 } },
    inventory: { items: () => opts.inv },
    recipesFor: mock((_id: number, _meta: any, _min: number, _table: any) => {
      const r = opts.recipesByCall[Math.min(rcall, opts.recipesByCall.length - 1)] ?? []
      rcall++
      return r
    }),
    craft: craftSpy,
    blockAt: () => null,
  }
  return { bot, craftSpy }
}

const recipe2x2 = { result: { id: 280, metadata: 0, count: 4 }, requiresTable: false }
const recipeTable = { result: { id: 270, metadata: 0, count: 1 }, requiresTable: true }

beforeEach(() => {
  ensureStationSpy = mock(async (_bot: any, _type: any, _signal?: any): Promise<any> => null)
  __craftDeps.ensureStation = ensureStationSpy as any
})

afterEach(() => {
  Object.assign(__craftDeps, realDeps)
})

// ── testes ───────────────────────────────────────────────────────────────────

test('receita 2x2 disponível -> success, observed = result.count*count', async () => {
  const { bot, craftSpy } = makeMockBot({
    inv: [{ name: 'oak_planks', count: 2 }],
    recipesByCall: [[recipe2x2]],
    craftBehavior: 'add',
    craftAddName: 'stick',
    craftAddCount: 4,
  })
  const r = await craft(bot, { itemName: 'stick', count: 1 })
  expect(r.outcome).toBe('success')
  expect(r.observed).toBe(4) // result.count(4) * count(1)
  expect(craftSpy).toHaveBeenCalledTimes(1)
})

test('2x2 vazio mas ensureStation retorna bancada e recipesFor(table) retorna receita -> success', async () => {
  const tableSpy = mock(async () => ({ name: 'crafting_table', position: { x: 1, y: 64, z: 0 } }))
  __craftDeps.ensureStation = tableSpy as any
  const { bot, craftSpy } = makeMockBot({
    inv: [{ name: 'oak_planks', count: 3 }, { name: 'stick', count: 2 }],
    // 1ª chamada (table=null) vazia; 2ª chamada (com bancada) retorna a receita.
    recipesByCall: [[], [recipeTable]],
    craftBehavior: 'add',
    craftAddName: 'wooden_pickaxe',
    craftAddCount: 1,
  })
  const r = await craft(bot, { itemName: 'wooden_pickaxe', count: 1 })
  expect(tableSpy).toHaveBeenCalledTimes(1)
  expect(r.outcome).toBe('success')
  expect(craftSpy).toHaveBeenCalledTimes(1)
})

test('sem receita em ambos (requiresTable sem bancada) -> no_effect; bot.craft NÃO chamado (gate D-15 #3)', async () => {
  __craftDeps.ensureStation = mock(async () => null) as any // não conseguiu bancada
  const { bot, craftSpy } = makeMockBot({
    inv: [{ name: 'oak_planks', count: 3 }],
    recipesByCall: [[], []],
  })
  const r = await craft(bot, { itemName: 'wooden_pickaxe', count: 1 })
  expect(r.outcome).toBe('no_effect')
  expect(r.observed).toBe(0)
  expect(r.reason).toMatch(/receita|bancada|ingrediente/i)
  expect(craftSpy).not.toHaveBeenCalled() // gate: NÃO deixa bot.craft lançar (Pitfall 4)
})

test('bot.craft LANÇA -> outcome error via evaluateCraft (observed 0 + threw); bot não trava', async () => {
  const { bot, craftSpy } = makeMockBot({
    inv: [{ name: 'oak_planks', count: 2 }],
    recipesByCall: [[recipe2x2]],
    craftBehavior: 'throw',
  })
  const r = await craft(bot, { itemName: 'stick', count: 1 })
  expect(craftSpy).toHaveBeenCalledTimes(1)
  expect(r.outcome).toBe('error')
  expect(r.observed).toBe(0)
  expect(r.reason).toBeDefined()
})

test('item desconhecido no registry -> no_effect (Pitfall 5: nome->id via itemsByName)', async () => {
  const { bot, craftSpy } = makeMockBot({ inv: [], recipesByCall: [[]] })
  const r = await craft(bot, { itemName: 'item_inexistente', count: 1 })
  expect(r.outcome).toBe('no_effect')
  expect(craftSpy).not.toHaveBeenCalled()
})

test('count>1 -> expected = result.count * count', async () => {
  const { bot } = makeMockBot({
    inv: [{ name: 'oak_planks', count: 8 }],
    recipesByCall: [[recipe2x2]],
    craftBehavior: 'add',
    craftAddName: 'stick',
    craftAddCount: 8, // 4 por craft * 2
  })
  const r = await craft(bot, { itemName: 'stick', count: 2 })
  expect(r.expected).toBe(8) // result.count(4) * count(2)
  expect(r.outcome).toBe('success')
})
