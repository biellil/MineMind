// src/cognition/reflection.ts
// REFL-01: as PEÇAS puras da reflexão (o disparo via deliberação single-flight é wiring do Plan 06).
//
// Três responsabilidades, todas testáveis (tempo/eventos/config por parâmetro):
//  - shouldReflect(...):     gatilho HÍBRIDO (D-10) — event-driven OU acúmulo de importância OU piso temporal.
//  - consolidate(...):       consolidação CP→LP (D-13) — promove os eventos recentes de maior importância
//                            a UM evento episódico persistido em LP. Roda SEMPRE (mesmo sem LLM); o summary
//                            opcional vem do LLM. Importância FORÇADA alta para sobreviver ao floor/scoring.
//  - applyGoalUpdates(...):  aplica os deltas de objetivo validados (keep/drop/reprioritize), imutável,
//                            com fallback no-op seguro (lista vazia / ids desconhecidos = inalterado).
//
// A reflexão NÃO é um nó novo no StateGraph — reusa a deliberação single-flight existente.
import type { Database } from 'bun:sqlite'
import type { MemEvent } from './types'
import type { Goal } from '../motivation/types'
import type { ReflectionOutput } from '../llm/schemas'
import { importanceOf, summarizeEvent } from '../memory/longTerm'
import { config } from '../config'

/** Estado do gatilho de reflexão (vive no holder/closure — testável por parâmetro). */
export interface ReflectionState {
  lastReflectionAt: number
  importanceAccum: number
}

/** Importância FORÇADA do evento consolidado (alta — sobrevive ao floor e domina o scoring). */
const CONSOLIDATION_IMPORTANCE = 8
/** Quantos dos eventos recentes de maior importância entram no resumo determinístico. */
const CONSOLIDATION_TOP_N = 5

/**
 * Gatilho híbrido (D-10): a reflexão dispara quando QUALQUER uma das três condições vale —
 *  - event-driven: o agente entrou em idle E o objetivo corrente terminou/falhou;
 *  - acúmulo:      a soma de importância dos eventos novos cruza config.reflectionImportanceThreshold;
 *  - piso temporal: passou config.reflectionMaxIntervalMs desde a última reflexão (anti-starvation).
 */
export function shouldReflect(args: {
  enteredIdle: boolean
  goalDoneOrFailed: boolean
  importanceAccum: number
  lastReflectionAt: number
  now: number
}): boolean {
  const eventDriven = args.enteredIdle && args.goalDoneOrFailed
  const accum = args.importanceAccum >= config.reflectionImportanceThreshold
  const floor = args.now - args.lastReflectionAt >= config.reflectionMaxIntervalMs
  return eventDriven || accum || floor
}

/**
 * Consolida CP→LP (D-13): promove os eventos recentes de MAIOR importância a UM evento episódico
 * persistido em LP. Roda SEMPRE (mesmo sem LLM). `summary` opcional vem do LLM; sem ele, deriva um
 * resumo determinístico dos top-N eventos. Retorna o id do evento consolidado, ou null se não há
 * nada a consolidar.
 *
 * DUPLICAÇÃO INTENCIONAL de persistEvent (longTerm.ts): MemEvent não modela uma variante "reflexão",
 * então NÃO usamos persistEvent (que derivaria uma importância baixa via importanceOf). Em vez disso
 * inserimos DIRETAMENTE em events com importância FORÇADA alta (CONSOLIDATION_IMPORTANCE).
 *
 * O VETOR do evento consolidado vai para o ChromaDB (D-07), NÃO mais para o vec0 (aposentado no
 * Plan 04 — D-01: relacional é a fonte da verdade; o índice é derivado/descartável). A escrita no
 * Chroma é feita pelo CALLER (runReflection em deliberation.ts) APÓS este INSERT, usando o `id`
 * retornado, fora da transação SQLite — `consolidate` permanece SÍNCRONO e testável sem Chroma.
 * O parâmetro `embedding` permanece na assinatura por compatibilidade (não é mais usado aqui; o
 * caller embeda e grava no Chroma).
 */
export function consolidate(
  db: Database,
  recent: ReadonlyArray<MemEvent>,
  now: number,
  _embedding: number[] | null,
  summary?: string,
): number | null {
  if (recent.length === 0) return null

  // Os N eventos recentes de maior importância (estável; não muta a entrada).
  const top = [...recent].sort((a, b) => importanceOf(b) - importanceOf(a)).slice(0, CONSOLIDATION_TOP_N)
  const detail = summary ?? top.map((e) => summarizeEvent(e)).join(' ')
  const payload = JSON.stringify({ kind: 'reflection', summary: detail, consolidatedAt: now, n: recent.length })

  const tx = db.transaction(() => {
    const res = db
      .prepare(
        `INSERT INTO events (type, ts, importance, summary, payload, player, last_access)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run('reflection', now, CONSOLIDATION_IMPORTANCE, detail, payload, null, now)
    return Number(res.lastInsertRowid)
  })

  return tx() as number
}

/**
 * Aplica os deltas de objetivo validados pela reflexão (REFL-01/D-13), imutável:
 *  - 'drop':         remove o goal por id;
 *  - 'reprioritize': seta priority (apenas se priority for fornecido; senão no-op de prioridade);
 *  - 'keep' / ids desconhecidos: inalterado.
 * Lista vazia => goals inalterados (fallback no-op seguro). Nunca muta a entrada.
 */
export function applyGoalUpdates(
  goals: Goal[],
  updates: ReflectionOutput['goalUpdates'],
  _now: number,
): Goal[] {
  if (updates.length === 0) return goals.map((g) => ({ ...g }))

  const byId = new Map(updates.map((u) => [u.id, u]))
  const out: Goal[] = []
  for (const g of goals) {
    const u = byId.get(g.id)
    if (!u) {
      out.push({ ...g }) // sem update para este goal — inalterado
      continue
    }
    if (u.action === 'drop') continue // filtra fora
    if (u.action === 'reprioritize' && u.priority !== undefined) {
      out.push({ ...g, priority: u.priority })
      continue
    }
    out.push({ ...g }) // 'keep' ou 'reprioritize' sem priority — inalterado
  }
  return out
}
