// src/perception/snapshot.test.ts
// Cobre o enriquecimento de percepção: lookingAt (blockAtCursor) e underfoot (blockAt offset -1),
// ambos defensivos a null. Mock mínimo de Bot — só o que buildWorldSnapshot lê.
import { test, expect } from 'bun:test'
import { buildWorldSnapshot } from './snapshot'

// Posição fake estilo Vec3: precisa de distanceTo(p) e offset(dx,dy,dz).
function makePos(x: number, y: number, z: number) {
  return {
    x,
    y,
    z,
    distanceTo(p: { x: number; y: number; z: number }) {
      return Math.hypot(p.x - x, p.y - y, p.z - z)
    },
    offset(dx: number, dy: number, dz: number) {
      return makePos(x + dx, y + dy, z + dz)
    },
  }
}

// Mock mínimo de Bot. cursorBlock e belowBlock parametrizam os ramos defensivos.
function makeMockBot(opts: {
  cursorBlock?: { name: string; position: { x: number; y: number; z: number } } | null
  belowBlock?: { name: string } | null
} = {}): any {
  const pos = makePos(0, 64, 0)
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
    blockAtCursor: (_max?: number) => opts.cursorBlock ?? null,
    blockAt: (_p: unknown) => opts.belowBlock ?? null,
  }
}

test('blockAtCursor retorna Block -> lookingAt preenchido com name/position/distance', () => {
  const bot = makeMockBot({
    cursorBlock: { name: 'oak_log', position: { x: 3, y: 64, z: 0 } },
  })
  const snap = buildWorldSnapshot(bot)
  expect(snap.lookingAt).not.toBeNull()
  expect(snap.lookingAt?.name).toBe('oak_log')
  expect(snap.lookingAt?.position).toEqual({ x: 3, y: 64, z: 0 })
  expect(snap.lookingAt?.distance).toBeCloseTo(3, 5)
})

test('blockAtCursor retorna null -> lookingAt === null', () => {
  const bot = makeMockBot({ cursorBlock: null })
  const snap = buildWorldSnapshot(bot)
  expect(snap.lookingAt).toBeNull()
})

test('blockAt(offset -1) retorna Block -> underfoot === block.name', () => {
  const bot = makeMockBot({ belowBlock: { name: 'grass_block' } })
  const snap = buildWorldSnapshot(bot)
  expect(snap.underfoot).toBe('grass_block')
})

test('blockAt(offset -1) retorna null -> underfoot === "unknown"', () => {
  const bot = makeMockBot({ belowBlock: null })
  const snap = buildWorldSnapshot(bot)
  expect(snap.underfoot).toBe('unknown')
})

test('snapshot continua congelado (Object.freeze) com os campos novos', () => {
  const bot = makeMockBot({
    cursorBlock: { name: 'stone', position: { x: 1, y: 64, z: 0 } },
    belowBlock: { name: 'dirt' },
  })
  const snap = buildWorldSnapshot(bot)
  expect(Object.isFrozen(snap)).toBe(true)
  expect(() => {
    ;(snap as Record<string, unknown>).underfoot = 'lava'
  }).toThrow()
})
