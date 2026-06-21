// src/skills/equip.test.ts
// Plan 09-04 / CRAFT-04 / D-16/D-17/D-19: equip standalone grounded por estado LOCAL
// (heldItem/slot de armadura, NÃO delta de inventário — Pitfall 2) + selectToolFor binário
// por categoria SEM ranking por tier (Fase 10 faz o tier).
//
// Mock mínimo de Bot (molde eat.test.ts): inventory.items() + inventory.slots mutável,
// heldItem mutável, bot.equip async que muda heldItem (hand) ou inventory.slots (armadura/off-hand)
// conforme o destino.
import { test, expect } from 'bun:test'
import { equip, selectToolFor } from './equip'

interface MockItem {
  name: string
  type: number
}

// Slots de armadura (D-19/Pitfall 2): head=5, torso=6, legs=7, feet=8; off-hand=45.
const ARMOR_SLOT: Record<string, number> = { head: 5, torso: 6, legs: 7, feet: 8 }

/**
 * Cria um bot mockado com os campos que `equip`/`selectToolFor` usam.
 *
 * @param opts.items    itens do inventário (bot.inventory.items())
 * @param opts.heldItem item inicialmente na mão (bot.heldItem)
 * @param opts.equipFails se true, bot.equip rejeita (simula falha de equip)
 * @param opts.noApply  se true, bot.equip resolve mas NÃO muda heldItem/slot (estado intacto)
 */
function makeMockBot(opts: {
  items: MockItem[]
  heldItem?: MockItem | null
  equipFails?: boolean
  noApply?: boolean
}) {
  const slots: Array<MockItem | null> = new Array(46).fill(null)
  const bot: any = {
    heldItem: opts.heldItem ?? null,
    inventory: {
      items: () => opts.items,
      slots,
    },
    equip: async (item: MockItem, dest: string) => {
      if (opts.equipFails) throw new Error('falha ao equipar')
      if (opts.noApply) return
      if (dest === 'hand') {
        bot.heldItem = item
      } else if (dest === 'off-hand') {
        slots[45] = item
      } else {
        slots[ARMOR_SLOT[dest]] = item
      }
    },
  }
  return { bot }
}

const stonePickaxe = { name: 'stone_pickaxe', type: 274 }
const woodenPickaxe = { name: 'wooden_pickaxe', type: 270 }
const diamondPickaxe = { name: 'diamond_pickaxe', type: 278 }
const ironSword = { name: 'iron_sword', type: 267 }
const ironHelmet = { name: 'iron_helmet', type: 306 }

// ── equip ───────────────────────────────────────────────────────────────────

test('item presente, destination hand -> success, observed 1, delta {} (verdade LOCAL via heldItem)', async () => {
  const { bot } = makeMockBot({ items: [stonePickaxe] })
  const r = await equip(bot, { itemName: 'stone_pickaxe', destination: 'hand' })
  expect(r.outcome).toBe('success')
  expect(r.observed).toBe(1)
  expect(r.expected).toBe(1)
  expect(r.delta).toEqual({})
  expect(bot.heldItem.name).toBe('stone_pickaxe')
})

test('destination ausente assume hand (padrão) -> success', async () => {
  const { bot } = makeMockBot({ items: [stonePickaxe] })
  const r = await equip(bot, { itemName: 'stone_pickaxe' })
  expect(r.outcome).toBe('success')
  expect(bot.heldItem.name).toBe('stone_pickaxe')
})

test('item ausente no inventário -> no_effect, observed 0, reason "item ausente"', async () => {
  const { bot } = makeMockBot({ items: [] })
  const r = await equip(bot, { itemName: 'stone_pickaxe', destination: 'hand' })
  expect(r.outcome).toBe('no_effect')
  expect(r.observed).toBe(0)
  expect(r.reason).toMatch(/item ausente/i)
})

test('item presente mas heldItem continua diferente após equip -> no_effect (verdade LOCAL)', async () => {
  const { bot } = makeMockBot({ items: [stonePickaxe], heldItem: ironSword, noApply: true })
  const r = await equip(bot, { itemName: 'stone_pickaxe', destination: 'hand' })
  expect(r.outcome).toBe('no_effect')
  expect(r.observed).toBe(0)
})

test('destination head -> inventory.slots[5] vira o item -> success', async () => {
  const { bot } = makeMockBot({ items: [ironHelmet] })
  const r = await equip(bot, { itemName: 'iron_helmet', destination: 'head' })
  expect(r.outcome).toBe('success')
  expect(bot.inventory.slots[5].name).toBe('iron_helmet')
})

test('bot.equip lança -> não vira fluxo de throw; grounding decide e reason anexado', async () => {
  const { bot } = makeMockBot({ items: [stonePickaxe], equipFails: true })
  const r = await equip(bot, { itemName: 'stone_pickaxe', destination: 'hand' })
  expect(r.outcome).toBe('no_effect') // equip falhou -> heldItem não mudou
  expect(r.reason).toBeDefined()
})

// ── selectToolFor (binário por categoria, SEM tier — D-17) ───────────────────

test('selectToolFor pickaxe -> retorna a pickaxe do inventário', () => {
  const { bot } = makeMockBot({ items: [ironSword, stonePickaxe] })
  const tool = selectToolFor(bot, 'pickaxe')
  expect(tool?.name).toBe('stone_pickaxe')
})

test('selectToolFor weapon -> retorna o sword (arma de corpo-a-corpo)', () => {
  const { bot } = makeMockBot({ items: [stonePickaxe, ironSword] })
  const tool = selectToolFor(bot, 'weapon')
  expect(tool?.name).toBe('iron_sword')
})

test('selectToolFor sem ferramenta da categoria -> null', () => {
  const { bot } = makeMockBot({ items: [ironSword] })
  const tool = selectToolFor(bot, 'pickaxe')
  expect(tool).toBeNull()
})

test('selectToolFor NÃO ranqueia por tier: com wooden e diamond pickaxe retorna o PRIMEIRO match (D-17)', () => {
  const { bot } = makeMockBot({ items: [woodenPickaxe, diamondPickaxe] })
  const tool = selectToolFor(bot, 'pickaxe')
  // ordem do inventário decide — NÃO o melhor tier; o primeiro é o wooden.
  expect(tool?.name).toBe('wooden_pickaxe')
})
