// test/db.ts
// Abre o minemind.sqlite REAL e despeja o que tem em cada tabela.
// Útil pra confirmar se a persistência está de fato sendo usada.
//
// Rodar:  bun run test/db.ts   (pode passar outro caminho: bun run test/db.ts ./outro.sqlite)

import { Database } from 'bun:sqlite'
import * as sqliteVec from 'sqlite-vec'

const path = process.argv[2] || './minemind.sqlite'
console.log(`[db] abrindo ${path}\n`)

const db = new Database(path)
try {
  sqliteVec.load(db)
} catch (e) {
  console.log('(sqlite-vec não carregou:', (e as Error).message, ')')
}

const tables = ['events', 'vec_events', 'players', 'places', 'kv']
console.log('=== CONTAGEM POR TABELA ===')
for (const t of tables) {
  try {
    const r = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }
    console.log(`  ${t.padEnd(12)} → ${r.n} linhas`)
  } catch (e) {
    console.log(`  ${t.padEnd(12)} → ERRO: ${(e as Error).message}`)
  }
}

console.log('\n=== ÚLTIMOS 8 EVENTS ===')
try {
  const rows = db
    .prepare('SELECT id,type,importance,summary,ts FROM events ORDER BY ts DESC LIMIT 8')
    .all() as any[]
  if (rows.length === 0) console.log('  (vazio)')
  for (const r of rows) {
    console.log(`  #${r.id} [${r.type}] imp=${r.importance} ${new Date(r.ts).toISOString()} :: ${String(r.summary).slice(0, 90)}`)
  }
} catch (e) {
  console.log('  erro:', (e as Error).message)
}

console.log('\n=== PLAYERS ===')
try {
  const rows = db.prepare('SELECT * FROM players').all() as any[]
  if (rows.length === 0) console.log('  (vazio)')
  for (const r of rows) console.log('  ' + JSON.stringify(r))
} catch (e) {
  console.log('  erro:', (e as Error).message)
}

console.log('\n=== PLACES ===')
try {
  const rows = db.prepare('SELECT * FROM places').all() as any[]
  if (rows.length === 0) console.log('  (vazio)')
  for (const r of rows) console.log('  ' + JSON.stringify(r))
} catch (e) {
  console.log('  erro:', (e as Error).message)
}

console.log('\n=== KV (a "mente" durável) ===')
try {
  const rows = db.prepare('SELECT key, length(value) AS tam, ts FROM kv').all() as any[]
  if (rows.length === 0) console.log('  (vazio)')
  for (const r of rows) console.log(`  ${r.key} (${r.tam} chars) @ ${new Date(r.ts).toISOString()}`)
} catch (e) {
  console.log('  erro:', (e as Error).message)
}

db.close()
