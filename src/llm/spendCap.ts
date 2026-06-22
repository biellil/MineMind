// src/llm/spendCap.ts
// PROV-05 / D-06 / D-07 / D-08: teto de custo como DECORATOR de LlmProvider.
//
// Por que decorator (D-06): não toca decideAction nem o loop cognitivo. O cap envolve a
// LlmProvider cloud e, ao estourar o teto de CHAMADAS por janela (D-07 hard-cap), roteia para
// o LM Studio local (fallback-to-local, D-08) — o bot fica "burro mas vivo" (Core Value: o loop
// nunca para). Reusa o mesmo gancho de degradação D-17: available() do provider roteado.
import type { Database } from 'bun:sqlite'
import type { ZodType } from 'zod'
import type { BaseMessage } from '@langchain/core/messages'
import type { LlmProvider } from './provider'
import { getCallCount, incrementCall, reserveCall, releaseCall } from './spendStore'

/**
 * Store de gasto INJETÁVEL — abstrai o backend (SQLite em produção, fake nos testes).
 * `now` é resolvido pelo chamador (withSpendCap passa Date.now()) para manter a janela
 * coerente entre a reserva (reserveCall) e o estorno (releaseCall).
 */
export interface SpendStore {
  /** Chamadas cloud já contabilizadas na janela de `now` (probe — usado só em available()). */
  getCallCount(now: number): number
  /** Conta UMA chamada cloud na janela de `now` (e soma `tokens` como métrica). Métrica legada. */
  incrementCall(now: number, tokens?: number): void
  /** D-10: reserva atômica de 1 slot; true se sob o teto, false se estourou. */
  reserveCall(now: number, maxCalls: number): boolean
  /** D-10: estorna 1 slot (fallback-to-local ou erro real não consumiu cloud). */
  releaseCall(now: number): void
}

/** Adaptador SQLite (D-09): fecha sobre `db` delegando ao spendStore por janela diária. */
export function sqliteSpendStore(db: Database): SpendStore {
  return {
    getCallCount: (now: number) => getCallCount(db, now),
    incrementCall: (now: number, tokens = 0) => incrementCall(db, now, tokens),
    reserveCall: (now: number, maxCalls: number) => reserveCall(db, now, maxCalls),
    releaseCall: (now: number) => releaseCall(db, now),
  }
}

/**
 * Envolve `cloud` com um teto de chamadas/janela. Ao atingir `cfg.maxCalls`, decide/chat caem
 * para `local` (fallback-to-local, D-08) sem incrementar o contador cloud. embed SEMPRE delega
 * ao `cloud` (que já é local por composição no Plano 01) — embed nunca conta para o teto.
 */
export function withSpendCap(
  cloud: LlmProvider,
  local: LlmProvider,
  store: SpendStore,
  cfg: { maxCalls: number },
): LlmProvider {
  return {
    // O cap envolve o provider cloud; expõe a capacidade do provider efetivo (D-07).
    maxConcurrency: cloud.maxConcurrency,

    // D-10: reserva ATÔMICA antes de disparar (increment-then-check) — fecha o TOCTOU. A reserva
    // sob o teto vai à cloud; ao estourar, estorna a reserva especulativa e cai para o local
    // (fallback-to-local custo-zero, D-08). Erro real do cloud também estorna (não pune o teto).
    async decide<T>(schema: ZodType<T>, messages: BaseMessage[], opts?: { signal?: AbortSignal }): Promise<T> {
      const now = Date.now()
      if (store.reserveCall(now, cfg.maxCalls)) {
        try {
          return await cloud.decide(schema, messages, opts)
        } catch (e) {
          store.releaseCall(now) // estorna no erro real (decisão de discrição D-10)
          throw e
        }
      }
      store.releaseCall(now) // estourou: estorna a reserva especulativa
      return local.decide(schema, messages, opts) // fallback-to-local (custo-zero)
    },

    async chat(messages: BaseMessage[], opts?: { signal?: AbortSignal }): Promise<string> {
      const now = Date.now()
      if (store.reserveCall(now, cfg.maxCalls)) {
        try {
          return await cloud.chat(messages, opts)
        } catch (e) {
          store.releaseCall(now)
          throw e
        }
      }
      store.releaseCall(now)
      return local.chat(messages, opts)
    },

    async available(): Promise<boolean> {
      // Probe (NÃO consome slot): roteia por getCallCount sem reservar. Sob cap -> local.available().
      return (store.getCallCount(Date.now()) >= cfg.maxCalls ? local : cloud).available()
    },

    // D-03/D-11: embeddings são sempre locais por composição no createOpenAiProvider; aqui apenas
    // delegamos ao cloud.embed (que já aponta para o LM Studio). Nunca conta para o teto.
    embed: cloud.embed,
  }
}
