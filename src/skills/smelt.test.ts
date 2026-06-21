// src/skills/smelt.test.ts
// Plan 09-03 / Task 3 / CRAFT-03 / D-06..D-11/D-20: smelt funde 1 item por chamada (loop cede entre
// itens), com close() OBRIGATÓRIO no finally (Pitfall 3 — fecha a window inclusive em erro), e é
// grounded pelo delta do item fundido (evaluateSmelt).
//
// Mockamos './station' (ensureStation). O furnace é um EventEmitter fake com putFuel/putInput/
// takeOutput/outputItem/close spies; emitimos 'update' para destravar o waitForOutput.
// Injeção via __smeltDeps (NÃO mock.module — vaza global no bun; convenção é injeção).
import { test, expect, mock, beforeEach, afterEach } from 'bun:test'
import { EventEmitter } from 'node:events'
import { smelt, __smeltDeps } from './smelt'

const realDeps = { ...__smeltDeps }

interface MockItem {
  name: string
  count: number
}

/** Furnace fake (EventEmitter) — spies para putFuel/putInput/takeOutput/close + outputItem mutável. */
function makeFurnace(opts: {
  outputName?: string
  hasFuel?: boolean
  putInputThrows?: boolean
}) {
  const f: any = new EventEmitter()
  f._output = null as MockItem | null
  f.fuel = opts.hasFuel ? 1 : 0
  f.progress = 0
  f.putFuel = mock(async (_id: number, _meta: any, _count: number) => {
    f.fuel = 1
  })
  f.putInput = mock(async (_id: number, _meta: any, _count: number) => {
    if (opts.putInputThrows) throw new Error('putInput falhou')
    // simula a fusão: agenda o output e o evento 'update'
    setTimeout(() => {
      f._output = { name: opts.outputName ?? 'iron_ingot', count: 1 }
      f.progress = 1
      f.emit('update')
    }, 5)
  })
  f.fuelItem = mock(() => (f.fuel > 0 ? { name: 'coal', count: 1 } : null))
  f.inputItem = mock(() => null)
  f.outputItem = mock(() => f._output)
  f.takeOutput = mock(async () => {
    const o = f._output
    f._output = null
    return o
  })
  f.close = mock(() => {})
  return f
}

/**
 * Bot mockado. inventory.items() devolve o array vivo `inv` — o takeOutput simula o ganho real
 * (push no inv) para o captureGroundState antes/depois ler o delta.
 */
function makeMockBot(opts: {
  inv: MockItem[]
  furnace: any
  gainName?: string
}) {
  const bot: any = {
    registry: { itemsByName: { iron_ore: { id: 100 }, raw_iron: { id: 101 }, coal: { id: 263 }, charcoal: { id: 264 }, oak_planks: { id: 5 } } },
    entity: { position: { x: 0, y: 64, z: 0 } },
    inventory: { items: () => opts.inv },
    openFurnace: mock(async (_block: any) => opts.furnace),
    blockAt: () => null,
  }
  // takeOutput do furnace empurra o ganho no inventário do bot
  const origTake = opts.furnace.takeOutput
  opts.furnace.takeOutput = mock(async () => {
    const o = await origTake()
    if (o) {
      const name = opts.gainName ?? o.name
      const ex = opts.inv.find((i) => i.name === name)
      if (ex) ex.count += 1
      else opts.inv.push({ name, count: 1 })
    }
    return o
  })
  return { bot }
}

beforeEach(() => {
  __smeltDeps.ensureStation = mock(async () => ({ name: 'furnace', position: { x: 1, y: 64, z: 0 } })) as any
})

afterEach(() => {
  Object.assign(__smeltDeps, realDeps)
})

// ── testes ───────────────────────────────────────────────────────────────────

test('fornalha disponível, funde 1 item -> success, observed = ganho do item fundido; close() chamado', async () => {
  const furnace = makeFurnace({ outputName: 'iron_ingot', hasFuel: true })
  const { bot } = makeMockBot({ inv: [{ name: 'iron_ore', count: 3 }], furnace })

  const r = await smelt(bot, { oreName: 'iron_ore', count: 1 })

  expect(r.outcome).toBe('success')
  expect(r.observed).toBe(1)
  expect(furnace.close).toHaveBeenCalledTimes(1)
})

test('sem fornalha (ensureStation null) -> no_effect; openFurnace NÃO chamado', async () => {
  __smeltDeps.ensureStation = mock(async () => null) as any
  const furnace = makeFurnace({ hasFuel: true })
  const { bot } = makeMockBot({ inv: [{ name: 'iron_ore', count: 3 }], furnace })

  const r = await smelt(bot, { oreName: 'iron_ore', count: 1 })

  expect(r.outcome).toBe('no_effect')
  expect(r.reason).toMatch(/fornalha/i)
  expect(bot.openFurnace).not.toHaveBeenCalled()
})

test('putInput lança -> outcome via evaluateSmelt; close() AINDA chamado (finally — Pitfall 3)', async () => {
  const furnace = makeFurnace({ hasFuel: true, putInputThrows: true })
  const { bot } = makeMockBot({ inv: [{ name: 'iron_ore', count: 3 }], furnace })

  const r = await smelt(bot, { oreName: 'iron_ore', count: 1 })

  // nada foi fundido (delta 0) + threw -> error
  expect(r.observed).toBe(0)
  expect(furnace.close).toHaveBeenCalledTimes(1) // close() SEMPRE (Pitfall 3)
})

test('combustível ausente quando needsFuel -> putFuel chamado (count derivado de ceil(1/perUnit))', async () => {
  const furnace = makeFurnace({ outputName: 'iron_ingot', hasFuel: false })
  // sem fuel inicialmente; bot tem coal no inventário
  const { bot } = makeMockBot({ inv: [{ name: 'iron_ore', count: 3 }, { name: 'coal', count: 2 }], furnace })

  await smelt(bot, { oreName: 'iron_ore', count: 1 })

  expect(furnace.putFuel).toHaveBeenCalledTimes(1)
})

test('outputItem captura o nome do produto antes do takeOutput (verdade do produto)', async () => {
  const furnace = makeFurnace({ outputName: 'iron_ingot', hasFuel: true })
  const { bot } = makeMockBot({ inv: [{ name: 'iron_ore', count: 1 }], furnace })

  const r = await smelt(bot, { oreName: 'iron_ore', count: 1 })

  expect(r.outcome).toBe('success')
  expect(furnace.outputItem).toHaveBeenCalled()
})
