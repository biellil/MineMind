// src/memory/persistence.test.ts
// MEM-02 / D-02/D-03: prova a fundação de persistência —
//  1) cold start cria o schema versionado (user_version=2 + 5 tabelas)
//  2) sobrevivência a reabertura (base de MEM-02)
//  3) recuperação graceful de um arquivo corrompido (D-03 — nunca aborta)
//  4) dimensão do vec0 = config.embeddingDim (Pitfall 2)
import { test, expect, afterAll } from 'bun:test'
import { Database } from 'bun:sqlite'
import { unlinkSync, existsSync, writeFileSync, readdirSync } from 'node:fs'
import { openDb, kvSet, kvGet, EMBEDDING_DIM } from './persistence'

const DB_PATH = './minemind.persist.test.sqlite'
// Path isolado para o teste de corrupção: WAL/handle de outro teste não pode "salvar" o
// arquivo-lixo via recuperação de WAL, o que mascararia a corrupção no Windows.
const CORRUPT_PATH = './minemind.persist.corrupt.test.sqlite'

// Windows mantém o handle do SQLite/WAL por um instante após db.close(); unlink direto lança EBUSY.
// Guardamos a remoção (mesma estratégia do vec.smoke.test.ts). Varre TODOS os artefatos de teste.
function safeCleanup(): void {
  const prefixes = ['minemind.persist.test.sqlite', 'minemind.persist.corrupt.test.sqlite']
  const targets: string[] = []
  try {
    for (const f of readdirSync('.')) {
      if (prefixes.some((p) => f.startsWith(p))) targets.push(`./${f}`)
    }
  } catch {
    // diretório ilegível: ignora
  }
  for (const f of targets) {
    if (existsSync(f)) {
      try {
        unlinkSync(f)
      } catch {
        // EBUSY no Windows: arquivo ainda travado pelo SO; removido no próximo run.
      }
    }
  }
}

safeCleanup()
afterAll(safeCleanup)

test('cold start: openDb num path inexistente cria o schema (user_version=2 + 5 tabelas)', () => {
  safeCleanup()
  const db = openDb(DB_PATH)

  const version = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
  expect(version).toBe(2)

  const tables = (
    db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table') ORDER BY name").all() as {
      name: string
    }[]
  ).map((r) => r.name)
  for (const t of ['events', 'players', 'places', 'kv', 'vec_events']) {
    expect(tables).toContain(t)
  }
  db.close()
})

test('sobrevivência a reabertura: kvSet → close → reopen → kvGet retorna o valor (MEM-02)', () => {
  safeCleanup()
  const db1 = openDb(DB_PATH)
  kvSet(db1, 'k', 'v', Date.now())
  db1.close()

  const db2 = openDb(DB_PATH)
  expect(kvGet(db2, 'k')).toBe('v')
  expect(kvGet(db2, 'inexistente')).toBeUndefined()
  db2.close()
})

test('recuperação graceful: arquivo corrompido NÃO lança e retorna um DB utilizável (D-03)', () => {
  // Escreve bytes-lixo num arquivo .sqlite (header SQLite inválido → corrupção).
  writeFileSync(CORRUPT_PATH, 'isto-nao-e-um-banco-sqlite-valido-xxxxxxxxxxxxxxxxxxxx')

  let db: Database | undefined
  expect(() => {
    db = openDb(CORRUPT_PATH)
  }).not.toThrow()
  expect(db).toBeDefined()

  // O handle é utilizável: o schema foi recriado no cold start.
  kvSet(db!, 'recovered', 'yes', Date.now())
  expect(kvGet(db!, 'recovered')).toBe('yes')

  // O arquivo corrompido foi preservado como .corrupt-*
  const hasCorrupt = readdirSync('.').some((f) =>
    f.startsWith(`${CORRUPT_PATH.replace('./', '')}.corrupt-`),
  )
  expect(hasCorrupt).toBe(true)
  db!.close()
})

test('vec0 tem dimensão = config.embeddingDim: Float32Array do tamanho certo OK, errado lança (Pitfall 2)', () => {
  safeCleanup()
  const db = openDb(DB_PATH)

  const right = new Float32Array(EMBEDDING_DIM).fill(0.1)
  expect(() => {
    db.prepare('INSERT INTO vec_events (rowid, embedding, ts, importance, event_id) VALUES (?, ?, ?, ?, ?)').run(
      1,
      right,
      Date.now(),
      5,
      1,
    )
  }).not.toThrow()

  const wrong = new Float32Array(EMBEDDING_DIM + 1).fill(0.1)
  expect(() => {
    db.prepare('INSERT INTO vec_events (rowid, embedding, ts, importance, event_id) VALUES (?, ?, ?, ?, ?)').run(
      2,
      wrong,
      Date.now(),
      5,
      2,
    )
  }).toThrow()

  db.close()
})
