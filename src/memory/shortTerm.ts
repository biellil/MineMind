// src/memory/shortTerm.ts
// MEM-01 / D-12 / D-13: ring buffer rico de eventos + evicção por orçamento de tokens estimado.
// Fase 3: o tokenizer real (js-tiktoken, encoding o200k_base) já está em uso — substituiu a
// antiga heurística ~4 chars/token sem alterar o contrato público da memória.
import { getEncoding } from 'js-tiktoken'
import type { MemEvent } from '../cognition/types'

/** Orçamento padrão de tokens da memória de curto prazo (D-13, Claude's discretion). */
export const DEFAULT_TOKEN_BUDGET = 2000

// Encoding carregado UMA vez no escopo do módulo (a construção é cara — não fazer por chamada).
// o200k_base aproxima modelos locais tipo Llama; erro tolerável (±3–12%) para orçamento FIFO.
const enc = getEncoding('o200k_base')

export interface ShortTermMemory {
  readonly events: MemEvent[]   // ordem cronológica: [0] = mais antigo
  readonly budget: number       // orçamento de tokens
}

/** Conta tokens de um evento via js-tiktoken (o200k_base). Assinatura preservada (D-13). */
export function estimateTokens(e: MemEvent): number {
  return enc.encode(JSON.stringify(e)).length
}

/** Cria uma memória vazia com o orçamento informado. */
export function createMemory(budget: number = DEFAULT_TOKEN_BUDGET): ShortTermMemory {
  return { events: [], budget }
}

/** Soma estimada de tokens de todos os eventos no buffer. */
export function totalTokens(mem: ShortTermMemory): number {
  return mem.events.reduce((sum, e) => sum + estimateTokens(e), 0)
}

/**
 * Acrescenta um evento e faz evicção FIFO enquanto o total estourar o orçamento.
 * Retorna uma NOVA ShortTermMemory (imutável — não muta a entrada).
 */
export function push(mem: ShortTermMemory, e: MemEvent): ShortTermMemory {
  const events = [...mem.events, e]
  let total = events.reduce((sum, x) => sum + estimateTokens(x), 0)
  while (total > mem.budget && events.length > 0) {
    total -= estimateTokens(events.shift()!)   // remove o mais antigo (FIFO)
  }
  return { events, budget: mem.budget }
}

/** Retorna os eventos em ordem cronológica (mais antigo primeiro). */
export function getEvents(mem: ShortTermMemory): ReadonlyArray<MemEvent> {
  return mem.events
}
