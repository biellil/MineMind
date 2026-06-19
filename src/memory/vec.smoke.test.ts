// src/memory/vec.smoke.test.ts
// Wave 0 de-risk (D-01 / RESEARCH Open Questions 1+2): prova que sqlite-vec carrega
// no bun:sqlite (Windows) e que um Float32Array faz round-trip por vec0.
import { test, expect, afterAll } from 'bun:test'
import { Database } from 'bun:sqlite'
import * as sqliteVec from 'sqlite-vec'
import { unlinkSync, existsSync } from 'node:fs'

const DB_PATH = './minemind.vecsmoke.test.sqlite'

// Windows mantém o handle do arquivo SQLite (e do WAL) por um instante após db.close().
// unlink direto lança EBUSY. Guardamos a remoção: o de-risk é o load+round-trip, não a limpeza.
function safeCleanup(): void {
  for (const f of [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`]) {
    if (existsSync(f)) {
      try {
        unlinkSync(f)
      } catch {
        // EBUSY no Windows: arquivo ainda travado pelo SO; será removido no próximo run.
      }
    }
  }
}

// Limpa restos de runs anteriores ANTES de começar (garante DB fresco).
safeCleanup()
afterAll(safeCleanup)

test('sqlite-vec carrega no bun:sqlite (Windows) e expõe vec_version', () => {
  const db = new Database(DB_PATH)
  sqliteVec.load(db)
  const row = db.prepare('select vec_version() as v').get() as { v: string }
  expect(typeof row.v).toBe('string')
  expect(row.v.length).toBeGreaterThan(0)
  db.close()
})

test('round-trip: INSERT Float32Array + KNN MATCH retorna o mesmo rowid', () => {
  const db = new Database(DB_PATH)
  sqliteVec.load(db)
  db.run('PRAGMA journal_mode = WAL')
  db.run(`CREATE VIRTUAL TABLE IF NOT EXISTS vec_smoke USING vec0(embedding float[4])`)

  const v1 = new Float32Array([1, 0, 0, 0])
  const v2 = new Float32Array([0, 1, 0, 0])
  db.prepare('INSERT INTO vec_smoke (rowid, embedding) VALUES (?, ?)').run(1, v1)
  db.prepare('INSERT INTO vec_smoke (rowid, embedding) VALUES (?, ?)').run(2, v2)

  const query = new Float32Array([0.9, 0.1, 0, 0]) // mais próximo de v1
  const hits = db
    .prepare('SELECT rowid, distance FROM vec_smoke WHERE embedding MATCH ? AND k = 2 ORDER BY distance')
    .all(query) as { rowid: number; distance: number }[]

  expect(hits.length).toBe(2)
  expect(hits[0].rowid).toBe(1) // o vetor mais próximo do query vem primeiro
  db.close()
})
