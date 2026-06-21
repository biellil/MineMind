// src/memory/longTerm.ts
// MEM-03 / MEM-02 (lado dos eventos): store de eventos de longo prazo.
//
// Três responsabilidades, todas determinísticas (sem LLM no caminho de importância/sumarização):
//  - importanceOf(e):   nota heurística 1-10 por tipo de MemEvent (D-06). Switch EXAUSTIVO.
//  - summarizeEvent(e): texto natural canônico a embeddar (NÃO o JSON cru — Anti-pattern).
//  - persistEvent(...): escrita ATÔMICA (evento + embedding na mesma transação — D-05/Pattern 3),
//                       respeitando o piso de importância (Pitfall 6).
//  - retrieve(...):     KNN no ChromaDB + scoring de Generative Agents (recência × importância ×
//                       relevância, min-max [0,1], pesos iguais α=1 — D-07/Pattern 4), renovando
//                       last_access dos eventos recuperados (fiel ao Park) e degradando gracioso
//                       sem embedding (LLM off) OU com o Chroma offline (fallback de recência).
//
// Plan 04: o vec0 foi aposentado — a fonte do KNN é o ChromaDB (índice derivado/descartável, D-01);
// se o Chroma cair, o relacional `events` segue intacto e o retrieve cai no fallback de recência.
import type { Database } from 'bun:sqlite'
import type { MemEvent } from '../cognition/types'
import type { ChromaMemoryClient } from './chromaClient'
import { config } from '../config'
import { EMBEDDING_DIM } from './persistence'

// Pesos iguais α=1 (D-07): nenhum fator domina; recência, importância e relevância pesam igual.
const W_RECENCY = 1
const W_IMPORTANCE = 1
const W_RELEVANCE = 1
export { W_RECENCY, W_IMPORTANCE, W_RELEVANCE }

/** Nota de importância heurística 1-10 por tipo de MemEvent (D-06). Switch EXAUSTIVO (default = 1). */
export function importanceOf(e: MemEvent): number {
  switch (e.type) {
    case 'world':
      if (e.event === 'damage') return 9
      if (e.event === 'player_joined') return 8 // "já conhecido"=4 fica para o caller com contexto de players
      if (e.event === 'hunger') return 6
      if (e.event === 'player_left') return 3
      return 4
    case 'chat_command':
      return 7
    case 'action':
      if (e.outcome === 'error' || e.outcome === 'no_effect') return 6 // falha observada
      if (e.outcome === 'partial') return 4 // progresso parcial (D-13 trata explícito)
      if (e.skill === 'gather' || e.skill === 'dig' || e.skill === 'collect') return 5
      return 2
    case 'state_transition':
      if (e.to === 'socializing' || e.to === 'fighting') return 5
      return 1
    default:
      return 1
  }
}

/** Texto NL canônico a embeddar (NÃO o JSON cru — Anti-pattern). Determinístico, sem LLM. */
export function summarizeEvent(e: MemEvent): string {
  switch (e.type) {
    case 'world':
      return `Evento de mundo: ${e.event} — ${e.detail}.`
    case 'action':
      return `Ação ${e.skill} em ${e.target}: ${e.outcome} (${e.observed}/${e.expected})${e.reason ? ` (${e.reason})` : ''}.`
    case 'state_transition':
      return `Mudei de estado: ${e.from} → ${e.to}.`
    case 'chat_command':
      return `Comando de chat de ${e.from}: "${e.command}" (modo ${e.mode}).`
  }
}

/** Decaimento exponencial de recência: 0.5 ^ (idade / meia-vida) ∈ (0,1]. recencyRaw(0) = 1. */
export function recencyRaw(ageMs: number): number {
  return Math.pow(0.5, ageMs / config.retrievalHalfLifeMs)
}

/** Normalizador min-max sobre um conjunto de valores. Empate (todos iguais) → 0 (trata Park). */
export function minMaxNormalizer(xs: number[]): (x: number) => number {
  const lo = Math.min(...xs)
  const hi = Math.max(...xs)
  const span = hi - lo
  return (x) => (span === 0 ? 0 : (x - lo) / span)
}

/** Forma de um evento recuperado pela retrieve (com o score combinado final). */
export interface RetrievedEvent {
  id: number
  summary: string
  payload: string
  importance: number
  score: number
}

/**
 * Persiste um evento em LP (D-05/Pattern 3). Retorna o id do evento, ou null se a importância
 * estiver abaixo do piso (config.ltImportanceFloor — Pitfall 6).
 *
 * O vec0 foi APOSENTADO no Plan 04 (Warning 2): persistEvent NÃO escreve mais vetores — o vetor
 * é responsabilidade EXCLUSIVA da reflexão (consolidate é o único ponto de embed, D-07) e vai
 * para o ChromaDB. O parâmetro `embedding` PERMANECE na assinatura por compatibilidade com os
 * call sites existentes (vira no-op aceito).
 */
export function persistEvent(
  db: Database,
  e: MemEvent,
  _embedding: number[] | null,
  now: number,
  player?: string | null,
): number | null {
  const importance = importanceOf(e)
  if (importance < config.ltImportanceFloor) return null

  const summary = summarizeEvent(e)
  const payload = JSON.stringify(e)

  const tx = db.transaction(() => {
    const res = db
      .prepare(
        `INSERT INTO events (type, ts, importance, summary, payload, player, last_access)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(e.type, e.timestamp, importance, summary, payload, player ?? null, now)
    return Number(res.lastInsertRowid)
  })

  return tx() as number
}

/** Candidato bruto (antes do scoring) — colunas do relacional `events` (+ relevance do KNN Chroma). */
interface Candidate {
  id: number
  summary: string
  payload: string
  importance: number
  last_access: number
  relevance: number // ∈ [0,1] (0 quando não há embedding de query)
}

/** Fallback de recência (sem embedding OU Chroma offline/sem hits): os mais recentes, relevance=0. */
function recencyCandidates(db: Database, player?: string): Candidate[] {
  const rows = db
    .prepare(
      `SELECT id, importance, last_access, summary, payload
       FROM events
       ${player ? 'WHERE player = ?' : ''}
       ORDER BY ts DESC
       LIMIT ?`,
    )
    .all(...(player ? [player, config.retrievalK] : [config.retrievalK])) as {
    id: number
    importance: number
    last_access: number
    summary: string
    payload: string
  }[]

  return rows.map((r) => ({
    id: r.id,
    summary: r.summary,
    payload: r.payload,
    importance: r.importance,
    last_access: r.last_access,
    relevance: 0,
  }))
}

/**
 * Recupera os top-N eventos por score Generative Agents (D-07/Pattern 4):
 *   score = W_RECENCY·recN + W_IMPORTANCE·impN + W_RELEVANCE·relN  (min-max sobre os candidatos)
 *
 * Passos:
 *  1. Com queryEmbedding válido E Chroma disponível: KNN no ChromaDB (queryVectors), JOIN com o
 *     relacional `events` por id; relevance = clamp(1 - distance, [0,1]). Filtro por player via
 *     o `where` do Chroma (D-04). Sem hits → cai no fallback de recência.
 *  2. Sem queryEmbedding OU Chroma offline/null: os retrievalK eventos mais recentes; relevance = 0.
 *  3. recency = recencyRaw(now - last_access), importance = events.importance, relevance (1/2).
 *  4. Min-max normaliza cada fator SOBRE os candidatos; soma ponderada; ordena desc; corta no limit.
 *  5. UPDATE events SET last_access = now nos retornados (renova recência).
 *
 * NUNCA lança: qualquer falha degrada para [] e loga (Environment Availability / Core Value).
 * O índice (Chroma) é derivado/descartável (D-01): Chroma offline → fallback, relacional intacto.
 */
export async function retrieve(
  db: Database,
  chroma: ChromaMemoryClient | null,
  queryEmbedding: number[] | null,
  now: number,
  opts?: { player?: string; limit?: number },
): Promise<RetrievedEvent[]> {
  const limit = opts?.limit ?? 5
  const player = opts?.player

  try {
    let candidates: Candidate[] = []

    if (queryEmbedding && queryEmbedding.length === EMBEDDING_DIM && chroma && chroma.isAvailable()) {
      // Passo 1: KNN no ChromaDB; ids (= String(events.id)) → JOIN com o relacional `events`.
      const hits = await chroma.queryVectors({
        queryEmbedding,
        nResults: config.retrievalK,
        player,
      })
      if (hits.length > 0) {
        const ids = hits.map((h) => Number(h.id))
        const placeholders = ids.map(() => '?').join(', ')
        const rows = db
          .prepare(
            `SELECT id, importance, last_access, summary, payload FROM events WHERE id IN (${placeholders})`,
          )
          .all(...ids) as Array<{
          id: number
          importance: number
          last_access: number
          summary: string
          payload: string
        }>
        const distById = new Map(hits.map((h) => [Number(h.id), h.distance]))
        candidates = rows.map((r) => ({
          id: r.id,
          summary: r.summary,
          payload: r.payload,
          importance: r.importance,
          last_access: r.last_access,
          relevance: Math.max(0, Math.min(1, 1 - (distById.get(r.id) ?? 1))), // cosine distance → relevance clamp [0,1]
        }))
      } else {
        // Chroma disponível mas sem hits → fallback de recência (igual ao caminho sem embedding).
        candidates = recencyCandidates(db, player)
      }
    } else {
      // Passo 2: fallback gracioso (sem embedding OU Chroma offline/null) — os mais recentes, relevance = 0.
      candidates = recencyCandidates(db, player)
    }

    if (candidates.length === 0) return []

    // Passos 3-4: fatores → min-max → soma ponderada → ordena desc → corta.
    const recencies = candidates.map((c) => recencyRaw(now - c.last_access))
    const importances = candidates.map((c) => c.importance)
    const relevances = candidates.map((c) => c.relevance)

    const normRec = minMaxNormalizer(recencies)
    const normImp = minMaxNormalizer(importances)
    const normRel = minMaxNormalizer(relevances)

    const scored = candidates
      .map((c, i) => ({
        ...c,
        score:
          W_RECENCY * normRec(recencies[i]!) +
          W_IMPORTANCE * normImp(importances[i]!) +
          W_RELEVANCE * normRel(relevances[i]!),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)

    // Passo 5: renova last_access dos eventos efetivamente recuperados.
    if (scored.length > 0) {
      const placeholders = scored.map(() => '?').join(', ')
      db.prepare(`UPDATE events SET last_access = ? WHERE id IN (${placeholders})`).run(
        now,
        ...scored.map((s) => s.id),
      )
    }

    return scored.map((s) => ({
      id: s.id,
      summary: s.summary,
      payload: s.payload,
      importance: s.importance,
      score: s.score,
    }))
  } catch (err) {
    console.error(`[longTerm] retrieve falhou (degradando para []): ${(err as Error).message}`)
    return []
  }
}
