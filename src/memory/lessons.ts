// src/memory/lessons.ts
// D-19/D-20: conhecimento durável evolutivo (lições). FRONTEIRA DESTA FASE: só storage + reforço/decay
// + consulta. A GERAÇÃO de lições (LLM) e o modelo Beta-Bernoulli (α/β) são da Phase 14 — sobre esta
// mesma tabela. Reforço/decay ARITMÉTICO simples. Determinístico-sem-LLM, nunca lança.
import type { Database } from 'bun:sqlite'
import type { LessonRow } from './persistence'

const REINFORCE_STEP = 0.1 // confiança sobe ao confirmar (D-20 discricionário)
const CONTRADICT_STEP = 0.2 // confiança desce ao contradizer (mais forte que o reforço)
const DECAY_STEP = 0.02 // decaimento temporal por aplicação de decay (boot/heartbeat)
const REMOVAL_THRESHOLD = 0.1 // abaixo disto a lição é descartada da consulta/poda

/** Insere uma lição nova (texto + confiança inicial). Retorna o id, ou null em falha. */
export function insertLesson(db: Database, text: string, now: number, confidence = 0.5): number | null {
  try {
    const res = db
      .prepare(
        `INSERT INTO lessons (text, confidence, reinforce_count, contradict_count, last_seen, created_at)
         VALUES (?, ?, 0, 0, ?, ?)`,
      )
      .run(text, confidence, now, now)
    return Number(res.lastInsertRowid)
  } catch (err) {
    console.error('[lessons] insertLesson falhou:', err instanceof Error ? err.message : err)
    return null
  }
}

/** Reforça: confidence += REINFORCE_STEP (cap 1), reinforce_count++, last_seen=now. */
export function reinforceLesson(db: Database, id: number, now: number): void {
  try {
    db.prepare(
      `UPDATE lessons SET confidence = MIN(1.0, confidence + ?), reinforce_count = reinforce_count + 1, last_seen = ? WHERE id = ?`,
    ).run(REINFORCE_STEP, now, id)
  } catch (err) {
    console.error('[lessons] reinforceLesson falhou:', err instanceof Error ? err.message : err)
  }
}

/** Contradiz: confidence -= CONTRADICT_STEP (piso 0), contradict_count++, last_seen=now. */
export function contradictLesson(db: Database, id: number, now: number): void {
  try {
    db.prepare(
      `UPDATE lessons SET confidence = MAX(0.0, confidence - ?), contradict_count = contradict_count + 1, last_seen = ? WHERE id = ?`,
    ).run(CONTRADICT_STEP, now, id)
  } catch (err) {
    console.error('[lessons] contradictLesson falhou:', err instanceof Error ? err.message : err)
  }
}

/** Decaimento temporal: confidence -= DECAY_STEP (piso 0). Chamar no boot/heartbeat, NÃO no tick. */
export function decayLessons(db: Database): void {
  try {
    db.prepare(`UPDATE lessons SET confidence = MAX(0.0, confidence - ?)`).run(DECAY_STEP)
  } catch (err) {
    console.error('[lessons] decayLessons falhou:', err instanceof Error ? err.message : err)
  }
}

/** Top-N lições por confiança (>= REMOVAL_THRESHOLD). Gancho de consulta para o LLM/Phase 14. */
export function topLessons(db: Database, n: number): LessonRow[] {
  try {
    return db
      .prepare(`SELECT * FROM lessons WHERE confidence >= ? ORDER BY confidence DESC LIMIT ?`)
      .all(REMOVAL_THRESHOLD, n) as LessonRow[]
  } catch (err) {
    console.error('[lessons] topLessons falhou:', err instanceof Error ? err.message : err)
    return []
  }
}
