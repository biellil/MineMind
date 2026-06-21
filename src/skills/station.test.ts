// src/skills/station.test.ts
// Plan 09-03 / Task 1 / D-12/D-13/D-14: ensureStation localiza|navega|posiciona uma estação
// (crafting_table/furnace) e registra o POI 'station' best-effort.
//
// Injeção de dependência via __stationDeps (NÃO mock.module — que vaza global no bun; convenção do
// projeto é injeção, ver deliberation.test.ts). beforeEach/afterEach restauram os colaboradores reais.
import { test, expect, mock, beforeEach, afterEach } from 'bun:test'
import { ensureStation, __stationDeps } from './station'

const realDeps = { ...__stationDeps }

interface MockBlock {
  name: string
  position: { x: number; y: number; z: number }
}

let placeBlockSafeSpy: ReturnType<typeof mock>
let getRefAndFaceSpy: ReturnType<typeof mock>
let upsertPlaceSpy: ReturnType<typeof mock>

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
    registry: { blocksByName: { crafting_table: { id: 58 }, furnace: { id: 61 } } },
    entity: { position: { x: 10.5, y: 64, z: 20.5 } },
    inventory: { items: () => opts.items ?? [] },
    findBlock: mock((_q: any) => {
      const r = opts.findResults[Math.min(call, opts.findResults.length - 1)]
      call++
      return r
    }),
    pathfinder: { goto: gotoSpy, stop: () => {} },
    blockAt: (_p: any) => null,
  }
  bot.mineMindDb = {} // handle do db best-effort (não bloqueia)
  return { bot, gotoSpy }
}

beforeEach(() => {
  placeBlockSafeSpy = mock(async () => ({ outcome: 'success', observed: 1, expected: 1, delta: {} }))
  getRefAndFaceSpy = mock((_bot: any, _t: any) => ({ ref: { name: 'dirt' }, face: { x: 0, y: 1, z: 0 } }))
  upsertPlaceSpy = mock((_db: any, _poi: any, _now: number) => {})
  __stationDeps.placeBlockSafe = placeBlockSafeSpy as any
  __stationDeps.getRefAndFace = getRefAndFaceSpy as any
  __stationDeps.upsertPlace = upsertPlaceSpy as any
})

afterEach(() => {
  Object.assign(__stationDeps, realDeps)
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
  __stationDeps.upsertPlace = mock(() => {
    throw new Error('db indisponível')
  }) as any
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
