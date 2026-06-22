// src/llm/spendStore.ts
// PROV-05 / D-07 / D-09: contador PERSISTENTE de chamadas (e tokens como métrica) por janela
// diária em SQLite. Reusa o handle de DB único da Fase 4 (openDb/holder.db) — sem arquivo novo.
//
// Por que SQLite e não in-memory (D-09): uma "sessão" always-on dura dias; o teto só faz sentido
// se sobrevive a restart/crash-loop. Um contador em RAM zeraria a cada queda e a fatura cloud
// escaparia exatamente no cenário que o teto existe para cobrir.
import { Database } from 'bun:sqlite'

/**
 * DDL idempotente do contador. Uma linha por janela (window_key = dia UTC):
 *  - calls: nº de chamadas cloud na janela (a UNIDADE do teto — D-07 hard-cap).
 *  - tokens: soma de tokens (apenas MÉTRICA de log para calibrar o teto depois — D-07, NÃO é gate).
 */
export function ensureSpendTable(db: Database): void {
  db.run(
    `CREATE TABLE IF NOT EXISTS llm_spend (
      window_key TEXT PRIMARY KEY,
      calls INTEGER NOT NULL DEFAULT 0,
      tokens INTEGER NOT NULL DEFAULT 0
    )`,
  )
}

/**
 * Chave da janela de cobrança (D-09: janela DIÁRIA UTC, 'YYYY-MM-DD').
 * Para virar janela MENSAL no futuro, basta trocar o slice para `.slice(0, 7)` ('YYYY-MM').
 */
export function windowKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10)
}

/**
 * Conta UMA chamada cloud na janela de `ts` e soma `tokens` (métrica). Upsert ATÔMICO:
 * cria a linha (calls=1, tokens) se a janela não existe, senão incrementa calls e soma tokens.
 * Chama ensureSpendTable para robustez (idempotente) — funciona mesmo num DB recém-aberto.
 */
export function incrementCall(db: Database, ts: number, tokens = 0): void {
  ensureSpendTable(db)
  db.prepare(
    `INSERT INTO llm_spend (window_key, calls, tokens) VALUES (?, 1, ?)
     ON CONFLICT(window_key) DO UPDATE SET calls = calls + 1, tokens = tokens + excluded.tokens`,
  ).run(windowKey(ts), tokens)
}

/**
 * Nº de chamadas cloud já contabilizadas na janela de `ts` (0 se a janela não existe).
 * É o valor que o hard-cap (D-07) compara contra o teto ANTES de cada chamada cara.
 */
export function getCallCount(db: Database, ts: number): number {
  ensureSpendTable(db)
  const row = db.prepare('SELECT calls FROM llm_spend WHERE window_key = ?').get(windowKey(ts)) as
    | { calls: number }
    | null
  return row?.calls ?? 0
}

/**
 * D-10: reserva 1 slot ATOMICAMENTE (increment-then-check). Retorna true se ficou <= maxCalls,
 * false se estourou (o caller faz releaseCall + fallback-to-local). O `INSERT...ON CONFLICT
 * RETURNING` é UMA operação indivisível no single-thread síncrono do bun:sqlite — fecha a janela
 * TOCTOU que o `getCallCount` (check) + `incrementCall` (act) em 2 passos abria entre o `await`.
 * Nota: o contador SOBE mesmo quando retorna false (a reserva é especulativa; o caller estorna).
 */
export function reserveCall(db: Database, ts: number, maxCalls: number): boolean {
  ensureSpendTable(db)
  const row = db
    .prepare(
      `INSERT INTO llm_spend (window_key, calls, tokens) VALUES (?, 1, 0)
       ON CONFLICT(window_key) DO UPDATE SET calls = calls + 1
       RETURNING calls`,
    )
    .get(windowKey(ts)) as { calls: number }
  return row.calls <= maxCalls
}

/**
 * D-10: estorna 1 slot (decrementa com piso 0) quando caímos no fallback-to-local (não consumiu
 * cloud) ou num erro real do cloud. `MAX(0, calls - 1)` garante que o contador nunca fica negativo.
 */
export function releaseCall(db: Database, ts: number): void {
  ensureSpendTable(db)
  db.prepare(`UPDATE llm_spend SET calls = MAX(0, calls - 1) WHERE window_key = ?`).run(windowKey(ts))
}
