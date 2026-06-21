// src/memory/poi-detect.test.ts
// GAP-01 (08.1-07): prova a fiação dos POIs de proximidade (resource + village):
//  recordResourcePoi:
//   (1) success + bloco no snapshot → 1 POI 'resource' na posição do exemplo mais próximo
//   (2) success sem examples → fallback na posição do bot
//   (3) outcome !== 'success' (no_effect/partial/error) → NÃO cria POI
//   (4) success sem posição válida → degrada sem lançar
//   (5) dedup: 2 coletas no mesmo bucket → 1 linha, visits=2
//  recordVillagePoi:
//   (6) aldeão ('villager') no snapshot → 1 POI 'village' no local do aldeão
//   (7) sem aldeão (zombie/player) → NÃO cria POI
//   (8) 'zombie_villager' (hostil) → NÃO cria POI
//   (9) idempotência por tick: 2x mesmo aldeão no mesmo bucket → 1 linha, visits=2
import { test, expect } from 'bun:test'
import type { Database } from 'bun:sqlite'
import type { WorldSnapshot } from '../perception/types'
import { openDb } from './persistence'
import { recordResourcePoi, recordVillagePoi } from './poi-detect'

function memDb(): Database {
  return openDb(':memory:')
}

function countPlaces(db: Database): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM places').get() as { n: number }).n
}

/** Monta um WorldSnapshot mínimo o suficiente para os helpers (campos extras irrelevantes). */
function fakeSnap(overrides: Partial<WorldSnapshot> = {}): WorldSnapshot {
  const base = {
    capturedAt: 0,
    status: { health: 20, food: 20, position: { x: 0, y: 64, z: 0 }, timeOfDay: 0, isDay: true },
    entities: [],
    players: [],
    nearbyBlockTypes: {},
    inventory: [],
    lookingAt: null,
    underfoot: 'stone',
  }
  return { ...base, ...overrides } as unknown as WorldSnapshot
}

// ---- recordResourcePoi ----

test('(1) success + bloco no snapshot → POI resource na posição do exemplo', () => {
  const db = memDb()
  const snap = fakeSnap({
    nearbyBlockTypes: { oak_log: { count: 3, examples: [{ x: 30, y: 70, z: 30 }] } },
  })
  recordResourcePoi(db, snap, 'oak_log', 'success', 1000)
  expect(countPlaces(db)).toBe(1)
  const row = db.prepare('SELECT type, x, y, z, notes FROM places').get() as {
    type: string; x: number; y: number; z: number; notes: string
  }
  expect(row.type).toBe('resource')
  expect(row.x).toBe(30)
  expect(row.y).toBe(70)
  expect(row.z).toBe(30)
  expect(row.notes).toBe('oak_log')
  db.close()
})

test('(2) success sem examples → fallback na posição do bot', () => {
  const db = memDb()
  const snap = fakeSnap({ status: { position: { x: 5, y: 64, z: 5 } } as never })
  recordResourcePoi(db, snap, 'oak_log', 'success', 1000)
  expect(countPlaces(db)).toBe(1)
  const row = db.prepare('SELECT type, x, y, z FROM places').get() as {
    type: string; x: number; y: number; z: number
  }
  expect(row.type).toBe('resource')
  expect(row.x).toBe(5)
  expect(row.z).toBe(5)
  db.close()
})

test('(3) outcome no_effect/partial/error → NÃO cria POI', () => {
  const db = memDb()
  const snap = fakeSnap({
    nearbyBlockTypes: { oak_log: { count: 3, examples: [{ x: 30, y: 70, z: 30 }] } },
  })
  recordResourcePoi(db, snap, 'oak_log', 'no_effect', 1000)
  recordResourcePoi(db, snap, 'oak_log', 'partial', 1000)
  recordResourcePoi(db, snap, 'oak_log', 'error', 1000)
  expect(countPlaces(db)).toBe(0)
  db.close()
})

test('(4) success sem posição válida → degrada sem lançar', () => {
  const db = memDb()
  // sem status.position e sem examples → não há posição → não cria lixo, não lança
  const snap = fakeSnap({ status: {} as never, nearbyBlockTypes: {} })
  expect(() => recordResourcePoi(db, snap, '', 'success', 1000)).not.toThrow()
  expect(countPlaces(db)).toBe(0)
  db.close()
})

test('(5) dedup: 2 coletas success no mesmo bucket → 1 linha, visits=2', () => {
  const db = memDb()
  const snap = fakeSnap({
    nearbyBlockTypes: { iron_ore: { count: 5, examples: [{ x: 100, y: 30, z: 100 }] } },
  })
  recordResourcePoi(db, snap, 'iron_ore', 'success', 1000)
  recordResourcePoi(db, snap, 'iron_ore', 'success', 2000) // mesmo bucket (GRID=12)
  expect(countPlaces(db)).toBe(1)
  const row = db.prepare('SELECT visits FROM places').get() as { visits: number }
  expect(row.visits).toBe(2)
  db.close()
})

// ---- recordVillagePoi ----

test('(6) aldeão no snapshot → POI village no local do aldeão', () => {
  const db = memDb()
  const snap = fakeSnap({
    entities: [
      {
        id: 1, type: 'mob', kind: 'Passive mobs', name: 'villager',
        position: { x: 50, y: 64, z: 50 }, distance: 8, health: 20, metadata: null,
      },
    ] as never,
  })
  recordVillagePoi(db, snap, 1000)
  expect(countPlaces(db)).toBe(1)
  const row = db.prepare('SELECT type, x, y, z, notes FROM places').get() as {
    type: string; x: number; y: number; z: number; notes: string
  }
  expect(row.type).toBe('village')
  expect(row.x).toBe(50)
  expect(row.z).toBe(50)
  expect(row.notes).toBe('villager')
  db.close()
})

test('(7) sem aldeão (zombie/player) → NÃO cria POI', () => {
  const db = memDb()
  const snap = fakeSnap({
    entities: [
      { id: 1, type: 'mob', kind: 'Hostile mobs', name: 'zombie', position: { x: 1, y: 64, z: 1 }, distance: 4, health: 20, metadata: null },
      { id: 2, type: 'player', kind: 'UNKNOWN', name: 'steve', position: { x: 2, y: 64, z: 2 }, distance: 3, health: 20, metadata: null },
    ] as never,
  })
  recordVillagePoi(db, snap, 1000)
  expect(countPlaces(db)).toBe(0)
  db.close()
})

test('(8) zombie_villager (hostil) → NÃO cria POI', () => {
  const db = memDb()
  const snap = fakeSnap({
    entities: [
      { id: 1, type: 'mob', kind: 'Hostile mobs', name: 'zombie_villager', position: { x: 1, y: 64, z: 1 }, distance: 4, health: 20, metadata: null },
    ] as never,
  })
  recordVillagePoi(db, snap, 1000)
  expect(countPlaces(db)).toBe(0)
  db.close()
})

test('(9) idempotência por tick: 2x mesmo aldeão no mesmo bucket → 1 linha, visits=2', () => {
  const db = memDb()
  const snap = fakeSnap({
    entities: [
      { id: 1, type: 'mob', kind: 'Passive mobs', name: 'villager', position: { x: 50, y: 64, z: 50 }, distance: 8, health: 20, metadata: null },
    ] as never,
  })
  recordVillagePoi(db, snap, 1000)
  recordVillagePoi(db, snap, 2000)
  expect(countPlaces(db)).toBe(1)
  const row = db.prepare('SELECT visits FROM places').get() as { visits: number }
  expect(row.visits).toBe(2)
  db.close()
})
