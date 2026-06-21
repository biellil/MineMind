// src/memory/persistence.migration.test.ts
// 08.1-01 Task 2: prova a migração de schema user_version 1→2 (e cold start 0→2) idempotente.
//  - Cold start (0→2): openDb(':memory:') já entrega o schema v2 completo.
//  - Migração de v1 existente (1→2): cria um DB cru em v1 (places SEM type) e roda applySchema.
//  - Idempotência: re-aplicar applySchema num DB já em v2 não lança e mantém user_version=2.
import { test, expect } from 'bun:test'
import { Database } from 'bun:sqlite'
import { openDb, applySchema } from './persistence'

/** DDL relacional da v1 (places SEM a coluna type) — espelha o estado pré-migração. */
const V1_RELATIONAL_DDL = `
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY, type TEXT NOT NULL, ts INTEGER NOT NULL,
    importance INTEGER NOT NULL, summary TEXT NOT NULL, payload TEXT NOT NULL,
    player TEXT, last_access INTEGER NOT NULL );
  CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
  CREATE INDEX IF NOT EXISTS idx_events_player ON events(player);
  CREATE TABLE IF NOT EXISTS players (
    username TEXT PRIMARY KEY, display_name TEXT, first_seen INTEGER NOT NULL,
    last_seen INTEGER NOT NULL, interactions INTEGER NOT NULL DEFAULT 0,
    trust REAL NOT NULL DEFAULT 0, notes TEXT );
  CREATE TABLE IF NOT EXISTS places (
    key TEXT PRIMARY KEY, label TEXT, x INTEGER NOT NULL, y INTEGER NOT NULL,
    z INTEGER NOT NULL, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL,
    visits INTEGER NOT NULL DEFAULT 1, notes TEXT );
  CREATE TABLE IF NOT EXISTS kv ( key TEXT PRIMARY KEY, value TEXT NOT NULL, ts INTEGER NOT NULL );
`

function userVersion(db: Database): number {
  return (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
}

function hasColumn(db: Database, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  return cols.some((c) => c.name === column)
}

function countMaster(db: Database, type: 'table' | 'index', name: string): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type = ? AND name = ?`)
    .get(type, name) as { n: number }
  return row.n
}

// ───────────────────────── Cenário 1: cold start 0→2 ─────────────────────────

test('cold start (0→2): openDb entrega schema v2 completo', () => {
  const db = openDb(':memory:')
  expect(userVersion(db)).toBe(2)
  expect(hasColumn(db, 'places', 'type')).toBe(true)
  expect(countMaster(db, 'table', 'lessons')).toBe(1)
  expect(countMaster(db, 'index', 'idx_places_xz')).toBe(1)
  db.close()
})

// ───────────────────────── Cenário 2: migração de v1 existente 1→2 ─────────────────────────

test('migração de v1 existente (1→2): applySchema adiciona places.type, lessons e índice', () => {
  const db = new Database(':memory:')
  // Monta um DB cru no estado v1: schema v1 + user_version=1, places SEM type.
  db.run(V1_RELATIONAL_DDL)
  db.run('PRAGMA user_version = 1')
  expect(userVersion(db)).toBe(1)
  expect(hasColumn(db, 'places', 'type')).toBe(false)

  applySchema(db)

  expect(userVersion(db)).toBe(2)
  expect(hasColumn(db, 'places', 'type')).toBe(true)
  expect(countMaster(db, 'table', 'lessons')).toBe(1)
  expect(countMaster(db, 'index', 'idx_places_xz')).toBe(1)

  // Inserir uma row em places com type='base' funciona após a migração.
  expect(() => {
    db.prepare(
      `INSERT INTO places (key, label, x, y, z, first_seen, last_seen, type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('home', 'Base', 10, 64, -20, 1, 1, 'base')
  }).not.toThrow()
  const inserted = db.prepare(`SELECT type FROM places WHERE key = 'home'`).get() as { type: string }
  expect(inserted.type).toBe('base')
  db.close()
})

// ───────────────────────── Cenário 3: idempotência (re-aplicar em v2) ─────────────────────────

test('idempotência: re-aplicar applySchema num DB já em v2 não lança e mantém user_version=2', () => {
  const db = openDb(':memory:')
  expect(userVersion(db)).toBe(2)
  // Segunda aplicação: early-return + addColumnIfMissing/IF NOT EXISTS não devem lançar.
  expect(() => applySchema(db)).not.toThrow()
  expect(userVersion(db)).toBe(2)
  expect(hasColumn(db, 'places', 'type')).toBe(true)
  expect(countMaster(db, 'table', 'lessons')).toBe(1)
  expect(countMaster(db, 'index', 'idx_places_xz')).toBe(1)
  db.close()
})
