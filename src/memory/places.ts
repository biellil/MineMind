// src/memory/places.ts
// D-14/D-15/D-16: memória espacial (POIs). Determinístico-sem-LLM, degrada gracioso (nunca lança).
//
// - upsertPlace:        grava um POI com dedup por BUCKET ESPACIAL (D-15) — a mesma veia/abrigo
//                       colapsa num único POI via ON CONFLICT(key) (incrementa visits + last_seen).
// - nearbyPlaces:       busca por proximidade — bounding-box pelo índice idx_places_xz (filtro barato)
//                       + ordenação EUCLIDIANA top-N em memória (D-16).
// - nearbyPlacesString: render textual "POIs próximos: ..." para injetar no prompt (D-16).
import type { Database } from 'bun:sqlite'
import type { PlaceType } from './persistence'

const GRID = 12 // bucket espacial em blocos (D-15 discricionário 8-16). Colapsa "a mesma veia/abrigo".
const SEARCH_RADIUS = 64 // raio da busca por proximidade em blocos (D-16 discricionário)

export interface PlaceRow {
  key: string
  label: string | null
  type: PlaceType | null
  x: number
  y: number
  z: number
  visits: number
  notes: string | null
}

/** Deriva a chave PK por bucket espacial + tipo (D-15): mesma região+tipo → mesmo POI. */
function bucketKey(x: number, y: number, z: number, type: PlaceType): string {
  const bx = Math.round(x / GRID)
  const by = Math.round(y / GRID)
  const bz = Math.round(z / GRID)
  return `${bx}:${by}:${bz}:${type}`
}

/** Upsert de POI com dedup por bucket (D-15). ON CONFLICT incrementa visits + atualiza last_seen. */
export function upsertPlace(
  db: Database,
  poi: { x: number; y: number; z: number; type: PlaceType; label?: string; notes?: string },
  now: number,
): void {
  try {
    const key = bucketKey(poi.x, poi.y, poi.z, poi.type)
    db.prepare(
      `INSERT INTO places (key, label, x, y, z, type, first_seen, last_seen, visits, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET visits = visits + 1, last_seen = excluded.last_seen`,
    ).run(
      key,
      poi.label ?? null,
      Math.round(poi.x),
      Math.round(poi.y),
      Math.round(poi.z),
      poi.type,
      now,
      now,
      poi.notes ?? null,
    )
  } catch (err) {
    console.error('[places] upsertPlace falhou (degradando):', err instanceof Error ? err.message : err)
  }
}

/** Busca por proximidade: bounding-box (índice x,z) + ordenação euclidiana top-N (D-16). */
export function nearbyPlaces(
  db: Database,
  px: number,
  py: number,
  pz: number,
  n: number,
): Array<PlaceRow & { dist: number }> {
  try {
    const rows = db
      .prepare(
        `SELECT key, label, type, x, y, z, visits, notes FROM places
         WHERE x BETWEEN ? AND ? AND z BETWEEN ? AND ?`,
      )
      .all(px - SEARCH_RADIUS, px + SEARCH_RADIUS, pz - SEARCH_RADIUS, pz + SEARCH_RADIUS) as PlaceRow[]
    return rows
      .map((r) => ({ ...r, dist: Math.hypot(r.x - px, r.y - py, r.z - pz) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, n)
  } catch (err) {
    console.error('[places] nearbyPlaces falhou (degradando):', err instanceof Error ? err.message : err)
    return []
  }
}

/** Render para o prompt (D-16): "POIs próximos: base (12m), veia de ferro (40m)". '' se vazio. */
export function nearbyPlacesString(db: Database, px: number, py: number, pz: number, n = 3): string {
  const near = nearbyPlaces(db, px, py, pz, n)
  if (near.length === 0) return ''
  const items = near.map((p) => `${p.label ?? p.type ?? 'lugar'} (${Math.round(p.dist)}m)`)
  return `POIs próximos: ${items.join(', ')}`
}
