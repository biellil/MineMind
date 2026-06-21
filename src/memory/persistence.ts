// src/memory/persistence.ts
// MEM-02 / D-02/D-03: fundação de persistência. Um único arquivo SQLite RELACIONAL com schema
// versionado por PRAGMA user_version, PRAGMAs de durabilidade (WAL) e recuperação graceful contra
// corrupção (Core Value: o loop NUNCA aborta).
//
// Memória VETORIAL vive no ChromaDB (serviço externo; embeddings locais via LM Studio) — o SQLite
// é só relacional. A virtual table `vec_events` (vec0/sqlite-vec) foi APOSENTADA (quick 260621-lj3):
// não é mais criada em DBs novos e o módulo sqlite-vec não é mais carregado no boot. DBs antigos
// mantêm a `vec_events` órfã/inerte — ela abre sem o módulo (quick_check=ok) e não afeta o relacional.
//
// Schema atual: v2 (D-14 places.type, D-19 tabela lessons, D-16 idx_places_xz). A migração é
// INCREMENTAL POR DEGRAUS e idempotente: roda tanto em cold start (user_version=0) quanto em DBs
// já existentes em v1, levando ambos a v2 sem perder dados (08.1-01).
import { Database } from 'bun:sqlite'
import { renameSync, existsSync } from 'node:fs'
import { config } from '../config'

/** Dimensão dos embeddings — deve casar com o modelo (Pitfall 2). Usado pelo ChromaDB e pela
 *  validação de dimensão em chromaClient/longTerm (não há mais índice vetorial no SQLite). */
export const EMBEDDING_DIM = config.embeddingDim
/** Versão do schema. Migrations checam PRAGMA user_version e aplicam migrações por degraus. */
const SCHEMA_VERSION = 2

/** Tipos de POI (D-14). Enum em TS — NÃO há CHECK no SQLite (places.type é TEXT nullable).
 *  'station' = local de uma estação de crafting/fornalha (Fase 9, D-14). */
export type PlaceType = 'base' | 'resource' | 'danger' | 'village' | 'landmark' | 'station'

/** Linha da tabela lessons (D-19) — conhecimento durável evolutivo, distinto de events pontuais. */
export interface LessonRow {
  id: number
  text: string
  confidence: number
  reinforce_count: number
  contradict_count: number
  last_seen: number
  created_at: number
}

/** DDL relacional (Pattern 2). */
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

/** Aplica PRAGMAs de durabilidade/performance (D-02). */
function applyPragmas(db: Database): void {
  db.run('PRAGMA journal_mode = WAL') // durabilidade sob crash
  db.run('PRAGMA synchronous = NORMAL') // WAL: NORMAL é seguro e ~2× mais rápido que FULL
  db.run('PRAGMA foreign_keys = ON')
  db.run('PRAGMA busy_timeout = 5000') // evita SQLITE_BUSY transitório
}

/**
 * Torna `ALTER TABLE ADD COLUMN` idempotente (SQLite não tem `ADD COLUMN IF NOT EXISTS`).
 * Lê PRAGMA table_info e só executa o ALTER se a coluna ainda não existir.
 * NOTA: PRAGMA table_info não aceita placeholder `?` para o nome da tabela — interpolar direto
 * (os valores são literais do código, não input externo).
 */
function addColumnIfMissing(db: Database, table: string, column: string, typeDdl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (cols.some((c) => c.name === column)) return
  db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${typeDdl}`)
}

/**
 * Aplica o schema POR DEGRAUS, idempotente, até SCHEMA_VERSION (D-03). Cobre dois casos com o
 * mesmo caminho: cold start (user_version=0 — cria o schema base v1) e DB já em v1 (só migra).
 *
 * - version < 1 (cold start): cria RELATIONAL_DDL (transação). NÃO seta user_version aqui;
 *   a sequência de migração abaixo leva o DB recém-criado de v1 → v2 no mesmo boot.
 * - version < 2 (cold start recém-criado OU DB existente em v1): migração 1→2 (D-14/D-19/D-16).
 *
 * Exportado para teste de migração de v1 (08.1-01 Task 2).
 */
export function applySchema(db: Database): void {
  const version = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
  if (version >= SCHEMA_VERSION) return

  if (version < 1) {
    // Cold start: schema base v1 (contém as colunas/tabelas da v1).
    const createRelational = db.transaction(() => {
      db.run(RELATIONAL_DDL)
    })
    createRelational()
  }

  if (version < 2) {
    // Migração 1→2. Roda tanto no cold start (acabamos de criar a v1 acima) quanto num DB já em v1.
    // D-14: coluna type nullable (ALTER ADD COLUMN no SQLite NÃO pode ser NOT NULL sem default).
    addColumnIfMissing(db, 'places', 'type', 'TEXT')
    // D-19: tabela de lições duráveis (conhecimento generalizado, distinto de events).
    db.run(`CREATE TABLE IF NOT EXISTS lessons (
      id INTEGER PRIMARY KEY,
      text TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.5,
      reinforce_count INTEGER NOT NULL DEFAULT 0,
      contradict_count INTEGER NOT NULL DEFAULT 0,
      last_seen INTEGER NOT NULL,
      created_at INTEGER NOT NULL )`)
    // D-16: índice para a busca por bounding-box (WHERE x BETWEEN .. AND z BETWEEN ..).
    db.run(`CREATE INDEX IF NOT EXISTS idx_places_xz ON places(x, z)`)
  }

  db.run(`PRAGMA user_version = ${SCHEMA_VERSION}`)
}

/**
 * Abre (ou cria) o store SQLite relacional. Aplica PRAGMAs e o schema (sem carregar sqlite-vec —
 * a memória vetorial vive no ChromaDB). DBs antigos com a `vec_events` órfã abrem normalmente.
 *
 * Recuperação graceful (D-03): se a abertura/schema falhar OU integrity_check acusar
 * corrupção, o arquivo corrompido é renomeado para `<path>.corrupt-<ts>` e um DB novo é
 * aberto do zero (recursão única). NUNCA propaga — o Core Value exige que o loop sempre rode.
 */
export function openDb(path: string = config.dbPath, _isRetry = false): Database {
  let db: Database | undefined
  try {
    db = new Database(path)
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
