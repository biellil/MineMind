// src/memory/persistence.ts
// MEM-02 / D-01/D-02/D-03: fundação de persistência. Um único arquivo SQLite (relacional +
// vetorial via sqlite-vec) com schema versionado por PRAGMA user_version, PRAGMAs de
// durabilidade (WAL) e recuperação graceful contra corrupção (Core Value: o loop NUNCA aborta).
//
// Bind de embedding: Float32Array DIRETO (não Buffer.from) — provado no Wave 0 (04-01-SUMMARY).
import { Database } from 'bun:sqlite'
import * as sqliteVec from 'sqlite-vec'
import { renameSync, existsSync } from 'node:fs'
import { config } from '../config'

/** Dimensão do índice vetorial vec0 — deve casar com o modelo de embedding (Pitfall 2). */
export const EMBEDDING_DIM = config.embeddingDim
/** Versão do schema. Migrations futuras checam PRAGMA user_version e aplicam ALTER TABLE. */
const SCHEMA_VERSION = 1

/** DDL relacional (Pattern 2). A virtual table vec0 é criada SEPARADAMENTE (ver applySchema). */
const RELATIONAL_DDL = `
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

/** DDL da virtual table vec0 (dimensão dinâmica). Não pode entrar em transação em algumas versões. */
function vecDdl(): string {
  return `CREATE VIRTUAL TABLE IF NOT EXISTS vec_events USING vec0(
    embedding float[${EMBEDDING_DIM}] distance_metric=cosine,
    ts integer, importance integer, +event_id integer )`
}

/** Aplica PRAGMAs de durabilidade/performance (D-02). */
function applyPragmas(db: Database): void {
  db.run('PRAGMA journal_mode = WAL') // durabilidade sob crash
  db.run('PRAGMA synchronous = NORMAL') // WAL: NORMAL é seguro e ~2× mais rápido que FULL
  db.run('PRAGMA foreign_keys = ON')
  db.run('PRAGMA busy_timeout = 5000') // evita SQLITE_BUSY transitório
}

/**
 * Cria o schema do zero se user_version=0 (cold start, D-03). O DDL relacional roda numa
 * transação; a virtual table vec0 é criada FORA da transação (alguns builds do vec0 não
 * suportam CREATE VIRTUAL TABLE dentro de BEGIN). user_version só sobe ao final.
 */
function applySchema(db: Database): void {
  const version = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
  if (version >= SCHEMA_VERSION) return

  const createRelational = db.transaction(() => {
    db.run(RELATIONAL_DDL)
  })
  createRelational()
  // vec0 fora da transação (ver nota acima).
  db.run(vecDdl())
  db.run(`PRAGMA user_version = ${SCHEMA_VERSION}`)
}

/**
 * Abre (ou cria) o store SQLite único. Carrega sqlite-vec, aplica PRAGMAs e o schema.
 *
 * Recuperação graceful (D-03): se a abertura/carga/schema falhar OU integrity_check acusar
 * corrupção, o arquivo corrompido é renomeado para `<path>.corrupt-<ts>` e um DB novo é
 * aberto do zero (recursão única). NUNCA propaga — o Core Value exige que o loop sempre rode.
 */
export function openDb(path: string = config.dbPath, _isRetry = false): Database {
  let db: Database | undefined
  try {
    db = new Database(path)
    sqliteVec.load(db)
    applyPragmas(db)

    // Detecta corrupção ANTES de mexer no schema (quick_check é mais barato que integrity_check).
    const check = (db.prepare('PRAGMA quick_check').get() as { quick_check: string }).quick_check
    if (check !== 'ok') throw new Error(`integrity_check falhou: ${check}`)

    applySchema(db)
    return db
  } catch (err) {
    console.error(`[persistence] falha ao abrir '${path}': ${(err as Error).message}`)
    // Windows trava o arquivo enquanto o handle está aberto: fechar ANTES de renomear (senão EBUSY).
    try {
      db?.close()
    } catch {
      // handle já inválido — ignora
    }
    // Já é uma retentativa (cold start) — não recursar de novo; devolve um DB em memória vazio
    // como último recurso para não abortar o loop.
    if (_isRetry) {
      console.error('[persistence] retentativa também falhou — usando DB em memória (volátil).')
      const mem = new Database(':memory:')
      try {
        sqliteVec.load(mem)
        applyPragmas(mem)
        applySchema(mem)
      } catch {
        // se nem isso, devolve o handle cru — o loop ainda roda, persistência fica degradada.
      }
      return mem
    }
    // Renomeia o arquivo corrompido (se existir) e tenta um cold start único.
    if (existsSync(path)) {
      const corruptPath = `${path}.corrupt-${Date.now()}`
      try {
        renameSync(path, corruptPath)
        console.error(`[persistence] DB corrompido movido para '${corruptPath}'; cold start.`)
      } catch (renameErr) {
        console.error(`[persistence] não consegui renomear o DB corrompido: ${(renameErr as Error).message}`)
      }
    }
    return openDb(path, true)
  }
}

/** Grava (ou substitui) um par chave/valor no KV durável. */
export function kvSet(db: Database, key: string, value: string, now: number): void {
  db.prepare('INSERT OR REPLACE INTO kv (key, value, ts) VALUES (?, ?, ?)').run(key, value, now)
}

/** Lê um valor do KV durável, ou undefined se a chave não existe. */
export function kvGet(db: Database, key: string): string | undefined {
  const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | null
  return row?.value
}
