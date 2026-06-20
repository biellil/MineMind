// src/skills/eat.test.ts
// Plan 08-02 / D-05 / SURV-01: skill reflexa `eat` grounded por delta de bot.food.
//
// Mock mínimo de Bot (estilo dig.test.ts): bot.food mutável, heldItem, inventory.items(),
// registry.foodsByName (índice por item.name — espelha o registry REAL do mineflayer; o índice
// por it.type estava errado e mascarava o bug que matou o bot de fome), equip (async no-op),
// consume (async que incrementa bot.food), deactivateItem (spy). Cobre TODOS os casos do plano.
import { test, expect } from 'bun:test'
import { eat } from './eat'

interface MockItem {
  name: string
  type: number
}

/**
 * Cria um bot mockado com os campos que `eat` usa.
 *
 * @param opts.foodBefore valor inicial de bot.food
 * @param opts.items      itens do inventário
 * @param opts.foods      registry.foodsByName (chave = item.name → { foodPoints, saturation })
 * @param opts.heldItem   item atualmente na mão (prevHeld)
 * @param opts.gainOnConsume quanto bot.food sobe quando consume() resolve (default 0)
 * @param opts.consumeThrows se true, consume() rejeita (simula falha de consumo)
 * @param opts.signal     AbortSignal opcional (runtime)
 */
function makeMockBot(opts: {
  foodBefore: number
  items: MockItem[]
  foods: Record<string, { foodPoints: number; saturation: number }>
  heldItem?: MockItem | null
  gainOnConsume?: number
  consumeThrows?: boolean
}) {
  const equipCalls: Array<{ name: string }> = []
  const state = { deactivateCalls: 0, consumeCalls: 0 }
  const bot: any = {
    food: opts.foodBefore,
    heldItem: opts.heldItem ?? null,
    inventory: { items: () => opts.items },
    registry: { foodsByName: opts.foods },
    equip: async (item: MockItem) => {
      equipCalls.push({ name: item.name })
      bot.heldItem = item
    },
    consume: async () => {
      state.consumeCalls += 1
      if (opts.consumeThrows) throw new Error('comeu errado')
      bot.food = Math.min(20, bot.food + (opts.gainOnConsume ?? 0))
    },
    deactivateItem: () => {
      state.deactivateCalls += 1
    },
  }
  return { bot, equipCalls, state }
}

const bread = { name: 'bread', type: 297 }
const apple = { name: 'apple', type: 260 }
const FOODS = { bread: { foodPoints: 5, saturation: 6 }, apple: { foodPoints: 4, saturation: 2.4 } }

// Regressão: o registry REAL keia foodsByName por NOME e os ids de comida (food.id) NÃO batem com
// item.type (ex.: cooked_beef item.type=1038, food.id=989). A skill DEVE achar a comida pelo nome —
// se voltar a indexar por it.type, este teste falha (o bot morria de fome com comida no inventário).
test('regressão id-mismatch: acha comida por NOME mesmo com food.id != item.type', async () => {
  const cookedBeef = { name: 'cooked_beef', type: 1038 } // item.type real ≠ food.id (989)
  const { bot } = makeMockBot({
    foodBefore: 9,
    items: [cookedBeef],
    foods: { cooked_beef: { foodPoints: 8, saturation: 12.8 } },
    gainOnConsume: 8,
  })
  const r = await eat(bot, {})
  expect(r.outcome).toBe('success')
  expect(r.observed).toBe(8)
  expect(r.expected).toBe(8)
})

test('sucesso: food sobe após consume -> success, observed = delta real', async () => {
  const { bot } = makeMockBot({ foodBefore: 10, items: [bread], foods: FOODS, gainOnConsume: 5 })
  const r = await eat(bot, {})
  expect(r.outcome).toBe('success')
  expect(r.observed).toBe(5)
  expect(r.expected).toBe(5) // foodPoints do bread
})

test('escolhe a comida de maior foodPoints', async () => {
  const { bot, equipCalls } = makeMockBot({
    foodBefore: 10,
    items: [apple, bread], // bread (5) > apple (4)
    foods: FOODS,
    gainOnConsume: 5,
  })
  await eat(bot, {})
  // primeiro equip deve ser o bread (maior foodPoints)
  expect(equipCalls[0]!.name).toBe('bread')
})

test('sem comida no inventário -> no_effect, observed 0', async () => {
  const { bot, state } = makeMockBot({ foodBefore: 10, items: [], foods: FOODS })
  const r = await eat(bot, {})
  expect(r.outcome).toBe('no_effect')
  expect(r.observed).toBe(0)
  expect(r.reason).toMatch(/sem comida/i)
  expect(state.consumeCalls).toBe(0)
})

test('food já cheio (consume não muda nada) -> no_effect, observed 0', async () => {
  const { bot } = makeMockBot({ foodBefore: 20, items: [bread], foods: FOODS, gainOnConsume: 0 })
  const r = await eat(bot, {})
  expect(r.outcome).toBe('no_effect')
  expect(r.observed).toBe(0)
})

test('re-equipa o item anterior quando prevHeld != comida', async () => {
  const sword = { name: 'iron_sword', type: 267 }
  const { bot, equipCalls } = makeMockBot({
    foodBefore: 10,
    items: [bread],
    foods: FOODS,
    heldItem: sword,
    gainOnConsume: 5,
  })
  await eat(bot, {})
  // último equip deve restaurar a espada
  expect(equipCalls[equipCalls.length - 1]!.name).toBe('iron_sword')
})

test('NÃO re-equipa quando prevHeld já é a própria comida', async () => {
  const { bot, equipCalls } = makeMockBot({
    foodBefore: 10,
    items: [bread],
    foods: FOODS,
    heldItem: bread,
    gainOnConsume: 5,
  })
  await eat(bot, {})
  // só um equip (o do consumo); sem re-equip extra
  expect(equipCalls.length).toBe(1)
})

test('abort antes de comer -> no_effect e não consome', async () => {
  const { bot, state } = makeMockBot({ foodBefore: 10, items: [bread], foods: FOODS, gainOnConsume: 5 })
  const ac = new AbortController()
  ac.abort()
  const r = await eat(bot, { signal: ac.signal })
  expect(r.outcome).toBe('no_effect')
  expect(r.observed).toBe(0)
  expect(r.reason).toMatch(/abort/i)
  expect(state.consumeCalls).toBe(0)
})

test('abort durante consume -> chama bot.deactivateItem()', async () => {
  const { bot, state } = makeMockBot({ foodBefore: 10, items: [bread], foods: FOODS, gainOnConsume: 0 })
  const ac = new AbortController()
  // dispara o abort assim que o consume começa
  bot.consume = async () => {
    state.consumeCalls += 1
    ac.abort()
  }
  await eat(bot, { signal: ac.signal })
  expect(state.deactivateCalls).toBe(1)
})

test('consume lança -> não vira fluxo de throw; grounding decide (no_effect) e reason anexado', async () => {
  const { bot } = makeMockBot({ foodBefore: 10, items: [bread], foods: FOODS, consumeThrows: true })
  const r = await eat(bot, {})
  expect(r.outcome).toBe('no_effect')
  expect(r.observed).toBe(0)
  expect(r.reason).toBeDefined()
})
