// src/social/profiles.ts
// SOC-01 / D-15 / D-16: perfis sociais por jogador, persistidos na tabela `players` (Plan 02).
//
// `trust` é um escalar DETERMINÍSTICO: só os deltas fixos de TRUST_DELTA, disparados por eventos
// VERIFICÁVEIS do Mineflayer (deu item / atacou / ...), o alteram — e sempre clampado em [-1,1].
// O LLM NUNCA calcula trust: a tipagem de `applyTrustEvent` (TrustEventKind) fecha a porta a
// qualquer string livre. Esta é a fronteira estrutural de D-15.
import { Database } from 'bun:sqlite'

/** Deltas determinísticos de trust por evento verificável do Mineflayer (D-15). LLM nunca calcula. */
export const TRUST_DELTA = {
  gaveItem: 0.2,
  helped: 0.1,
  attacked: -0.4,
  stole: -0.3,
  interaction: 0.01,
} as const

/** Os únicos eventos que podem mover trust. Restringe `applyTrustEvent` em tempo de tipo. */
export type TrustEventKind = keyof typeof TRUST_DELTA

const TRUST_MIN = -1
const TRUST_MAX = 1

/** Perfil social de um jogador (camelCase; a tabela `players` é snake_case). */
export interface PlayerProfile {
  username: string
  displayName: string | null
  firstSeen: number
  lastSeen: number
  interactions: number
  trust: number
  notes: string | null
}

/** Linha crua de `players` (snake_case) usada só internamente por getProfile. */
interface PlayerRow {
  username: string
  display_name: string | null
  first_seen: number
  last_seen: number
  interactions: number
  trust: number
  notes: string | null
}

/**
 * Upsert de um jogador (D-16): na primeira vez cria a linha (interactions=1, trust=0,
 * first_seen=last_seen=now); revê-lo atualiza last_seen e incrementa interactions. O
 * display_name é preservado por COALESCE quando o upsert não traz um novo (first_seen é imutável).
 */
export function upsertPlayer(db: Database, username: string, now: number, displayName?: string): void {
  db.prepare(
    `INSERT INTO players (username, display_name, first_seen, last_seen, interactions, trust)
     VALUES (?, ?, ?, ?, 1, 0)
     ON CONFLICT(username) DO UPDATE SET
       last_seen = excluded.last_seen,
       interactions = players.interactions + 1,
       display_name = COALESCE(excluded.display_name, players.display_name)`,
  ).run(username, displayName ?? null, now, now)
}

/**
 * Aplica um delta de trust determinístico (D-15), clampado em [-1,1] direto no SQL. No-op se o
 * jogador ainda não existe (chame upsertPlayer antes). Só aceita TrustEventKind — sem strings livres.
 */
export function applyTrustEvent(db: Database, username: string, kind: TrustEventKind): void {
  const delta = TRUST_DELTA[kind]
  db.prepare(`UPDATE players SET trust = max(?, min(?, trust + ?)) WHERE username = ?`).run(
    TRUST_MIN,
    TRUST_MAX,
    delta,
    username,
  )
}

/** Lê o perfil de um jogador (snake_case → camelCase), ou undefined se ausente. */
export function getProfile(db: Database, username: string): PlayerProfile | undefined {
  const row = db
    .prepare(
      `SELECT username, display_name, first_seen, last_seen, interactions, trust, notes
       FROM players WHERE username = ?`,
    )
    .get(username) as PlayerRow | null
  if (!row) return undefined
  return {
    username: row.username,
    displayName: row.display_name,
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
    interactions: row.interactions,
    trust: row.trust,
    notes: row.notes,
  }
}
