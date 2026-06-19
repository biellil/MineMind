// src/memory/longTerm.test.ts
// MEM-03: testes do store de eventos de LP.
//  - Task 1: funções PURAS (importanceOf, summarizeEvent, recencyRaw, minMaxNormalizer) — rápido, sem DB.
//  - Task 2: persistEvent (escrita atômica) + retrieve (KNN + scoring) — DB temporário + cleanup.
import { test, expect, afterAll } from 'bun:test'
import { unlinkSync, existsSync } from 'node:fs'
import { openDb, EMBEDDING_DIM } from './persistence'
import {
  importanceOf,
  summarizeEvent,
  recencyRaw,
  minMaxNormalizer,
  persistEvent,
  retrieve,
} from './longTerm'
import { config } from '../config'
import type { MemEvent } from '../cognition/types'

// ───────────────────────── Task 1: funções puras ─────────────────────────

test('importanceOf: mapeamento heurístico por tipo (D-06)', () => {
  // world
  expect(importanceOf({ type: 'world', event: 'damage', detail: 'x', timestamp: 0 })).toBe(9)
  expect(importanceOf({ type: 'world', event: 'player_joined', detail: 'x', timestamp: 0 })).toBe(8)
  expect(importanceOf({ type: 'world', event: 'hunger', detail: 'x', timestamp: 0 })).toBe(6)
  expect(importanceOf({ type: 'world', event: 'player_left', detail: 'x', timestamp: 0 })).toBe(3)
  // chat_command
  expect(
    importanceOf({ type: 'chat_command', command: '!vem', from: 'p', mode: 'autonomous', timestamp: 0 }),
  ).toBe(7)
  // action
  expect(
    importanceOf({ type: 'action', skill: 'navigate', target: 'x', result: 'failure', timestamp: 0 }),
  ).toBe(6)
  expect(
    importanceOf({ type: 'action', skill: 'navigate', target: 'x', result: 'success', timestamp: 0 }),
  ).toBe(2)
  expect(
    importanceOf({ type: 'action', skill: 'gather', target: 'oak_log', result: 'success', timestamp: 0 }),
  ).toBe(5)
  // state_transition
  expect(importanceOf({ type: 'state_transition', from: 'idle', to: 'exploring', timestamp: 0 })).toBe(1)
  expect(importanceOf({ type: 'state_transition', from: 'idle', to: 'socializing', timestamp: 0 })).toBe(5)
})

test('importanceOf é total: nenhum MemEvent retorna undefined (switch exaustivo)', () => {
  const samples: MemEvent[] = [
    { type: 'state_transition', from: 'idle', to: 'gathering', timestamp: 0 },
    { type: 'action', skill: 'dig', target: 'stone', result: 'success', timestamp: 0 },
    { type: 'world', event: 'damage', detail: 'mob', timestamp: 0 },
    { type: 'chat_command', command: '!pausar', from: 'p', mode: 'paused', timestamp: 0 },
  ]
  for (const e of samples) {
    const n = importanceOf(e)
    expect(typeof n).toBe('number')
    expect(n).toBeGreaterThanOrEqual(1)
    expect(n).toBeLessThanOrEqual(10)
  }
})

test('summarizeEvent: texto natural (não JSON cru) cobrindo os 4 tipos', () => {
  const st = summarizeEvent({ type: 'state_transition', from: 'idle', to: 'exploring', timestamp: 0 })
  expect(st).toContain('exploring')
  expect(st).not.toContain('{"type"')

  const ac = summarizeEvent({ type: 'action', skill: 'gather', target: 'oak_log', result: 'success', timestamp: 0 })
  expect(ac).toContain('gather')
  expect(ac).not.toContain('{"type"')

  const wl = summarizeEvent({ type: 'world', event: 'damage', detail: 'zombie', timestamp: 0 })
  expect(wl).toContain('damage')
  expect(wl).not.toContain('{"type"')

  const cc = summarizeEvent({ type: 'chat_command', command: '!vem', from: 'biel', mode: 'autonomous', timestamp: 0 })
  expect(cc).toContain('biel')
  expect(cc).not.toContain('{"type"')
})

test('recencyRaw: 1 em t=0, ~0.5 na meia-vida, monotonicamente decrescente', () => {
  expect(recencyRaw(0)).toBe(1)
  expect(recencyRaw(config.retrievalHalfLifeMs)).toBeCloseTo(0.5, 5)
  expect(recencyRaw(config.retrievalHalfLifeMs)).toBeGreaterThan(recencyRaw(2 * config.retrievalHalfLifeMs))
  expect(recencyRaw(1)).toBeGreaterThan(recencyRaw(1000))
})

test('minMaxNormalizer: 0/0.5/1 e empate → 0 (Park)', () => {
  const f = minMaxNormalizer([1, 2, 3])
  expect(f(1)).toBe(0)
  expect(f(3)).toBe(1)
  expect(f(2)).toBe(0.5)
  const flat = minMaxNormalizer([5, 5, 5])
  expect(flat(5)).toBe(0)
})

// ───────────────────────── Task 2: persistEvent + retrieve (DB) ─────────────────────────

const DB_PATH = './minemind.longterm.test.sqlite'

// Windows mantém o handle do SQLite (e WAL/SHM) por um instante após close() → unlink lança EBUSY.
function safeCleanup(): void {
  for (const f of [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`]) {
    if (existsSync(f)) {
      try {
        unlinkSync(f)
      } catch {
        // EBUSY no Windows: será removido no próximo run.
      }
    }
  }
}

safeCleanup()
afterAll(safeCleanup)

/** Embedding sintético de dimensão correta com um "pico" no índice dado (sem chamar LM Studio). */
function synthEmbedding(peak: number): number[] {
  const v = new Array<number>(EMBEDDING_DIM).fill(0)
  v[peak % EMBEDDING_DIM] = 1
  return v
}

test('persistEvent: importância >= floor insere em events E vec_events (mesmo rowid), retorna id', () => {
  const db = openDb(DB_PATH)
  const e: MemEvent = { type: 'world', event: 'damage', detail: 'zombie', timestamp: 1000 }
  const id = persistEvent(db, e, synthEmbedding(0), 1000)
  expect(id).not.toBeNull()

  const evRow = db.prepare('SELECT COUNT(*) AS n FROM events WHERE id = ?').get(id) as { n: number }
  expect(evRow.n).toBe(1)
  const vecRow = db.prepare('SELECT COUNT(*) AS n FROM vec_events WHERE rowid = ?').get(id) as { n: number }
  expect(vecRow.n).toBe(1)
  db.close()
})

test('persistEvent: importância < floor NÃO insere (retorna null) — controla crescimento', () => {
  const db = openDb(DB_PATH)
  const before = (db.prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number }).n
  // state_transition mundano = importance 1 < floor (3)
  const e: MemEvent = { type: 'state_transition', from: 'idle', to: 'exploring', timestamp: 2000 }
  expect(config.ltImportanceFloor).toBeGreaterThan(1)
  const id = persistEvent(db, e, synthEmbedding(1), 2000)
  expect(id).toBeNull()
  const after = (db.prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number }).n
  expect(after).toBe(before)
  db.close()
})

test('retrieve: o evento com embedding idêntico ao query e recente aparece no topo', () => {
  const db = openDb(DB_PATH)
  const now = 100_000
  // Alvo: embedding no pico 5, recente.
  const target = persistEvent(db, { type: 'world', event: 'damage', detail: 'alvo', timestamp: now - 1000 }, synthEmbedding(5), now - 1000)
  // Distratores: embeddings ortogonais, mais antigos.
  persistEvent(db, { type: 'world', event: 'hunger', detail: 'd1', timestamp: now - 50_000 }, synthEmbedding(10), now - 50_000)
  persistEvent(db, { type: 'chat_command', command: '!x', from: 'p', mode: 'autonomous', timestamp: now - 80_000 }, synthEmbedding(20), now - 80_000)

  const results = retrieve(db, synthEmbedding(5), now, { limit: 3 })
  expect(results.length).toBeGreaterThan(0)
  expect(results[0]!.id).toBe(target as number)
  // ordenado desc por score
  for (let i = 1; i < results.length; i++) {
    expect(results[i - 1]!.score).toBeGreaterThanOrEqual(results[i]!.score)
  }
  db.close()
})

test('retrieve: renova last_access dos eventos retornados para now', () => {
  const db = openDb(DB_PATH)
  const now = 200_000
  const id = persistEvent(db, { type: 'world', event: 'damage', detail: 'renova', timestamp: 1 }, synthEmbedding(7), 1) as number
  const before = (db.prepare('SELECT last_access FROM events WHERE id = ?').get(id) as { last_access: number }).last_access
  expect(before).toBe(1)

  const results = retrieve(db, synthEmbedding(7), now, { limit: 5 })
  expect(results.some((r) => r.id === id)).toBe(true)

  const after = (db.prepare('SELECT last_access FROM events WHERE id = ?').get(id) as { last_access: number }).last_access
  expect(after).toBe(now)
  db.close()
})

test('retrieve: embedding null (LLM off) NÃO lança — cai para recência×importância', () => {
  const db = openDb(DB_PATH)
  const now = 300_000
  persistEvent(db, { type: 'world', event: 'damage', detail: 'fallback', timestamp: now - 100 }, null, now - 100)
  persistEvent(db, { type: 'world', event: 'hunger', detail: 'fallback2', timestamp: now - 200 }, null, now - 200)

  let results: ReturnType<typeof retrieve> = []
  expect(() => {
    results = retrieve(db, null, now, { limit: 5 })
  }).not.toThrow()
  expect(results.length).toBeGreaterThan(0)
  db.close()
})
