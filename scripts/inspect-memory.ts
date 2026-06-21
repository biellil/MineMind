// scripts/inspect-memory.ts
// Helper de verificação manual da Fase 08.1 — lê o minemind.sqlite (readonly, seguro com o bot rodando).
// Uso:
//   bun run scripts/inspect-memory.ts            → resumo geral (contagens + últimos eventos/POIs/lições)
//   bun run scripts/inspect-memory.ts death       → só morte (evento type:'death' + POI type:'danger')
import { Database } from 'bun:sqlite'
import { config } from '../src/config'

const db = new Database(config.dbPath, { readonly: true })
const mode = process.argv[2]

function table(label: string, rows: unknown[]) {
  console.log(`\n=== ${label} (${rows.length}) ===`)
  if (rows.length) console.table(rows)
}

if (mode === 'death') {
  table(
    "Eventos de morte (type='death')",
    db.query("SELECT id, type, importance, summary, ts FROM events WHERE type = 'death' ORDER BY id DESC").all(),
  )
  table(
    "POIs de perigo (type='danger')",
    db.query("SELECT key, type, label, x, y, z, visits FROM places WHERE type = 'danger' ORDER BY last_seen DESC").all(),
  )
} else {
  const count = (t: string) => (db.query(`SELECT count(*) AS c FROM ${t}`).get() as { c: number }).c
  console.log('Contagens:', {
    events: count('events'),
    places: count('places'),
    players: count('players'),
    lessons: count('lessons'),
    kv: count('kv'),
  })
  table(
    'Últimos eventos',
    db.query('SELECT id, type, importance, substr(summary,1,55) AS summary FROM events ORDER BY id DESC LIMIT 8').all(),
  )
  table(
    'POIs (places)',
    db.query('SELECT key, type, label, x, y, z, visits FROM places ORDER BY last_seen DESC LIMIT 10').all(),
  )
  table('Lições', db.query('SELECT id, substr(text,1,50) AS text, confidence, reinforce_count, contradict_count FROM lessons ORDER BY confidence DESC LIMIT 10').all())
}

db.close()
