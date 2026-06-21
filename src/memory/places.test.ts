// src/memory/places.test.ts
// D-14/D-15/D-16: prova a memória espacial (POIs):
//  (a) upsert insere; segundo upsert no MESMO bucket incrementa visits (NÃO cria 2 linhas)
//  (b) buckets diferentes → 2 linhas
//  (c) nearbyPlaces ordena por distância e respeita o bounding-box (POI fora do raio não aparece)
//  (d) nearbyPlacesString retorna '' sem POIs
import { test, expect } from 'bun:test'
import type { Database } from 'bun:sqlite'
import { openDb } from './persistence'
import { upsertPlace, nearbyPlaces, nearbyPlacesString } from './places'

function memDb(): Database {
  return openDb(':memory:')
}

function countPlaces(db: Database): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM places').get() as { n: number }).n
}

test('(a) upsert no mesmo bucket incrementa visits, não cria 2 linhas', () => {
  const db = memDb()
  upsertPlace(db, { x: 0, y: 64, z: 0, type: 'base' }, 1000)
  upsertPlace(db, { x: 2, y: 65, z: 1, type: 'base' }, 2000) // mesmo bucket (GRID=12) + mesmo tipo
  expect(countPlaces(db)).toBe(1)
  const row = db.prepare('SELECT visits, last_seen FROM places').get() as { visits: number; last_seen: number }
  expect(row.visits).toBe(2)
  expect(row.last_seen).toBe(2000)
  db.close()
})

test('(b) buckets diferentes → 2 linhas', () => {
  const db = memDb()
  upsertPlace(db, { x: 0, y: 64, z: 0, type: 'base' }, 1000)
  upsertPlace(db, { x: 200, y: 64, z: 200, type: 'resource' }, 1000) // bucket distinto + tipo distinto
  expect(countPlaces(db)).toBe(2)
  db.close()
})

test('(b2) mesmo bucket espacial mas tipo diferente → 2 linhas', () => {
  const db = memDb()
  upsertPlace(db, { x: 0, y: 64, z: 0, type: 'base' }, 1000)
  upsertPlace(db, { x: 0, y: 64, z: 0, type: 'danger' }, 1000)
  expect(countPlaces(db)).toBe(2)
  db.close()
})

test('(c) nearbyPlaces ordena por distância e respeita o bounding-box', () => {
  const db = memDb()
  upsertPlace(db, { x: 10, y: 64, z: 0, type: 'resource', label: 'longe' }, 1000)
  upsertPlace(db, { x: 3, y: 64, z: 0, type: 'base', label: 'perto' }, 1000)
  upsertPlace(db, { x: 500, y: 64, z: 500, type: 'village', label: 'fora-do-raio' }, 1000)

  const near = nearbyPlaces(db, 0, 64, 0, 5)
  expect(near.length).toBe(2) // o de (500,500) fica fora do SEARCH_RADIUS=64
  expect(near[0]!.label).toBe('perto') // ordenado por distância euclidiana ascendente
  expect(near[1]!.label).toBe('longe')
  expect(near[0]!.dist).toBeLessThan(near[1]!.dist)
  db.close()
})

test('(c2) nearbyPlaces respeita o top-N', () => {
  const db = memDb()
  upsertPlace(db, { x: 1, y: 64, z: 0, type: 'base' }, 1000)
  upsertPlace(db, { x: 20, y: 64, z: 0, type: 'resource' }, 1000)
  upsertPlace(db, { x: 30, y: 64, z: 0, type: 'danger' }, 1000)
  expect(nearbyPlaces(db, 0, 64, 0, 2).length).toBe(2)
  db.close()
})

test('(d) nearbyPlacesString retorna "" sem POIs e a linha "POIs próximos:" com POIs', () => {
  const db = memDb()
  expect(nearbyPlacesString(db, 0, 64, 0, 3)).toBe('')
  upsertPlace(db, { x: 5, y: 64, z: 0, type: 'base', label: 'casa' }, 1000)
  const s = nearbyPlacesString(db, 0, 64, 0, 3)
  expect(s).toContain('POIs próximos:')
  expect(s).toContain('casa')
  db.close()
})
