// src/skills/station.test.ts
// Plan 09-03 / Task 1 / D-12/D-13/D-14: ensureStation localiza|navega|posiciona uma estação
// (crafting_table/furnace) e registra o POI 'station' best-effort.
//
// Mockamos os módulos colaboradores ('./placeBlock' e '../memory/places') via mock.module ANTES
// de importar station — assim controlamos placeBlockSafe/getRefAndFace e observamos upsertPlace
// sem tocar o SQLite. O bot é mockado (findBlock, pathfinder.goto, inventory.items, registry,
// entity.position).
import { test, expect, mock, beforeEach } from 'bun:test'

// ── spies dos colaboradores ──────────────────────────────────────────────────
let placeBlockSafeSpy = mock(async () => ({ outcome: 'success', observed: 1, expected: 1, delta: {} }))
let getRefAndFaceSpy = mock((_bot: any, _t: any) => ({ ref: { name: 'dirt' }, face: { x: 0, y: 1, z: 0 } }))
let upsertPlaceSpy = mock((_db: any, _poi: any, _now: number) => {})

mock.module('./placeBlock', () => ({
  placeBlockSafe: (...a: any[]) => (placeBlockSafeSpy as any)(...a),
  getRefAndFace: (...a: any[]) => (getRefAndFaceSpy as any)(...a),
}))
mock.module('../memory/places', () => ({
  upsertPlace: (...a: any[]) => (upsertPlaceSpy as any)(...a),
}))

// Import APÓS os mocks (bun resolve o mock.module no carregamento do SUT).
const { ensureStation } = await import('./station')

// ── helpers de mock ──────────────────────────────────────────────────────────
interface MockBlock {
  name: string
  position: { x: number; y: number; z: number }
}

/**
 * Cria um bot mockado com os campos que ensureStation usa.
 * @param opts.findResults sequência de retornos de bot.findBlock (1 por chamada; o resto repete o último)
 * @param opts.items       itens do inventário (bot.inventory.items())
 */
function makeMockBot(opts: {
  findResults: Array<MockBlock | null>
  items?: Array<{ name: string }>
}) {
  let call = 0
  const gotoSpy = mock(async (_goal: any) => {})
  const bot: any = {
    registry: {
      blocksByName: { crafting_table: { id: 58 }, furnace: { id: 61 } },
    },
    entity: { position: { x: 10.5, y: 64, z: 20.5 } },
    inventory: { items: () => opts.items ?? [] },
    findBlock: mock((_q: any) => {
      const r = opts.findResults[Math.min(call, opts.findResults.length - 1)]
      call++
      return r
    }),
    pathfinder: { goto: gotoSpy },
    blockAt: (_p: any) => null,
  }
  // db best-effort exposto no bot (acesso ao handle durável — best-effort, não bloqueia)
  bot.mineMindDb = {}
  return { bot, gotoSpy }
}

beforeEach(() => {
  placeBlockSafeSpy = mock(async () => ({ outcome: 'success', observed: 1, expected: 1, delta: {} }))
  getRefAndFaceSpy = mock((_bot: any, _t: any) => ({ ref: { name: 'dirt' }, face: { x: 0, y: 1, z: 0 } }))
  upsertPlaceSpy = mock((_db: any, _poi: any, _now: number) => {})
})

// ── testes ───────────────────────────────────────────────────────────────────

test('findBlock acha furnace -> navega (goto chamado) e retorna o Block; NÃO chama placeBlock', async () => {
  const furnace: MockBlock = { name: 'furnace', position: { x: 12, y: 64, z: 20 } }
  const { bot, gotoSpy } = makeMockBot({ findResults: [furnace] })

  const result = await ensureStation(bot, 'furnace')

  expect(result).toBe(furnace as any)
  expect(gotoSpy).toHaveBeenCalledTimes(1)
  expect(placeBlockSafeSpy).not.toHaveBeenCalled()
})

test('findBlock null mas há furnace no inventário -> placeBlockSafe (fallback) e retorna o Block recém-colocado', async () => {
  const placed: MockBlock = { name: 'furnace', position: { x: 11, y: 64, z: 20 } }
  // 1ª findBlock (raio 16) = null → fallback; 2ª findBlock (raio 4, re-validação) = bloco colocado.
  const { bot } = makeMockBot({ findResults: [null, placed], items: [{ name: 'furnace' }] })

  const result = await ensureStation(bot, 'furnace')

  expect(placeBlockSafeSpy).toHaveBeenCalledTimes(1)
  expect(result).toBe(placed as any)
})

test('findBlock null E sem item no inventário -> retorna null (sem estação e sem como plantar)', async () => {
  const { bot } = makeMockBot({ findResults: [null], items: [] })

  const result = await ensureStation(bot, 'crafting_table')

  expect(result).toBeNull()
  expect(placeBlockSafeSpy).not.toHaveBeenCalled()
})

test('registra POI station via upsertPlace quando a estação é confirmada (best-effort)', async () => {
  const furnace: MockBlock = { name: 'furnace', position: { x: 12, y: 64, z: 20 } }
  const { bot } = makeMockBot({ findResults: [furnace] })

  await ensureStation(bot, 'furnace')

  expect(upsertPlaceSpy).toHaveBeenCalledTimes(1)
  const [, poi] = upsertPlaceSpy.mock.calls[0] as any[]
  expect(poi.type).toBe('station')
  expect(poi.x).toBe(12)
  expect(poi.label).toBe('furnace')
})

test('upsertPlace lança -> ensureStation NÃO falha e ainda retorna a estação (POI é cache, não verdade)', async () => {
  upsertPlaceSpy = mock(() => {
    throw new Error('db indisponível')
  })
  const furnace: MockBlock = { name: 'furnace', position: { x: 12, y: 64, z: 20 } }
  const { bot } = makeMockBot({ findResults: [furnace] })

  const result = await ensureStation(bot, 'furnace')

  expect(result).toBe(furnace as any)
})

test('placement falha (re-findBlock null após place) -> retorna null', async () => {
  // findBlock raio16 = null → fallback place; re-findBlock raio4 = null (placement não confirmou).
  const { bot } = makeMockBot({ findResults: [null, null], items: [{ name: 'crafting_table' }] })

  const result = await ensureStation(bot, 'crafting_table')

  expect(placeBlockSafeSpy).toHaveBeenCalledTimes(1)
  expect(result).toBeNull()
})
