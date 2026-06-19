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
import { getCallCount, incrementCall } from './spendStore'

/**
 * Store de gasto INJETÁVEL — abstrai o backend (SQLite em produção, fake nos testes).
 * `now` é resolvido pelo chamador (withSpendCap passa Date.now()) para manter a janela
 * coerente entre a checagem (getCallCount) e a contabilização (incrementCall).
 */
export interface SpendStore {
  /** Chamadas cloud já contabilizadas na janela de `now`. */
  getCallCount(now: number): number
  /** Conta UMA chamada cloud na janela de `now` (e soma `tokens` como métrica). */
  incrementCall(now: number, tokens?: number): void
}

/** Adaptador SQLite (D-09): fecha sobre `db` delegando ao spendStore por janela diária. */
export function sqliteSpendStore(db: Database): SpendStore {
  return {
    getCallCount: (now: number) => getCallCount(db, now),
    incrementCall: (now: number, tokens = 0) => incrementCall(db, now, tokens),
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
  // D-07: hard-cap checado ANTES de qualquer chamada cara. >= maxCalls -> roteia para o local.
  const route = (): LlmProvider => (store.getCallCount(Date.now()) >= cfg.maxCalls ? local : cloud)

  return {
    async decide<T>(schema: ZodType<T>, messages: BaseMessage[]): Promise<T> {
      const p = route()
      // Só conta quando realmente vai à cloud (o fallback-to-local é custo-zero, não conta — D-08).
      // tokens=0: o gate é por CHAMADAS (D-07); tokens via usage_metadata fica como métrica futura.
      if (p === cloud) store.incrementCall(Date.now())
      return p.decide(schema, messages)
    },

    async chat(messages: BaseMessage[]): Promise<string> {
      const p = route()
      if (p === cloud) store.incrementCall(Date.now())
      return p.chat(messages)
    },

    async available(): Promise<boolean> {
      // Disponibilidade do provider EFETIVAMENTE roteado (sob cap -> local.available()).
      return route().available()
    },

    // D-03/D-11: embeddings são sempre locais por composição no createOpenAiProvider; aqui apenas
    // delegamos ao cloud.embed (que já aponta para o LM Studio). Nunca conta para o teto.
    embed: cloud.embed,
  }
}
