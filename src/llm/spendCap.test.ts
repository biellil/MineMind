// src/llm/spendCap.test.ts
// PROV-05 / D-06 / D-07 / D-08 + 10.1 D-10: decorator withSpendCap (hard-cap -> fallback-to-local)
// com reserva ATÔMICA (reserveCall/releaseCall) fechando o TOCTOU.
// Sem rede e sem SQLite real — usa mocks de LlmProvider e um SpendStore fake injetado.
import { test, expect } from 'bun:test'
import { withSpendCap, type SpendStore } from './spendCap'
import type { LlmProvider } from './provider'
import type { BaseMessage } from '@langchain/core/messages'
import { HumanMessage } from '@langchain/core/messages'
import type { ZodType } from 'zod'
import { z } from 'zod'

const messages: BaseMessage[] = [new HumanMessage('decida')]
const schema = z.object({ action: z.string() }) as unknown as ZodType<{ action: string }>

/** Mock de LlmProvider rotulado (`tag`) para asserir QUAL provider foi roteado. */
function mockProvider(tag: 'cloud' | 'local', calls: Record<string, number>): LlmProvider {
  return {
    maxConcurrency: 1,
    decide: (async () => {
      calls[`${tag}.decide`] = (calls[`${tag}.decide`] ?? 0) + 1
      return { action: tag } as unknown
    }) as LlmProvider['decide'],
    chat: async () => {
      calls[`${tag}.chat`] = (calls[`${tag}.chat`] ?? 0) + 1
      return tag
    },
    available: async () => {
      calls[`${tag}.available`] = (calls[`${tag}.available`] ?? 0) + 1
      return true
    },
    embed: async () => {
      calls[`${tag}.embed`] = (calls[`${tag}.embed`] ?? 0) + 1
      return [1, 2, 3]
    },
  }
}

/** Cloud cujo decide/chat SEMPRE lançam (para testar o estorno no catch — D-10). */
function throwingCloud(calls: Record<string, number>): LlmProvider {
  return {
    maxConcurrency: 1,
    decide: (async () => {
      calls['cloud.decide'] = (calls['cloud.decide'] ?? 0) + 1
      throw new Error('cloud boom')
    }) as LlmProvider['decide'],
    chat: async () => {
      calls['cloud.chat'] = (calls['cloud.chat'] ?? 0) + 1
      throw new Error('cloud boom')
    },
    available: async () => true,
    embed: async () => [1, 2, 3],
  }
}

/**
 * SpendStore fake in-memory: reserveCall faz increment-then-check (count++ e compara com maxCalls),
 * releaseCall decrementa com piso 0. Rastreia reserves/releases e getCallCount p/ available().
 */
function fakeStore(initialCount: number): SpendStore & {
  count: number
  reserves: number
  releases: number
} {
  return {
    count: initialCount,
    reserves: 0,
    releases: 0,
    getCallCount(_now: number): number {
      return this.count
    },
    incrementCall(_now: number, _tokens?: number): void {
      this.count += 1
    },
    reserveCall(_now: number, maxCalls: number): boolean {
      this.reserves += 1
      this.count += 1 // increment-then-check (especulativo)
      return this.count <= maxCalls
    },
    releaseCall(_now: number): void {
      this.releases += 1
      this.count = Math.max(0, this.count - 1)
    },
  }
}

test('abaixo do teto: decide chama cloud.decide; reserveCall 1x; releaseCall NÃO chamado (sucesso)', async () => {
  const calls: Record<string, number> = {}
  const cloud = mockProvider('cloud', calls)
  const local = mockProvider('local', calls)
  const store = fakeStore(0)

  const provider = withSpendCap(cloud, local, store, { maxCalls: 3 })
  const res = (await provider.decide(schema, messages)) as { action: string }

  expect(res.action).toBe('cloud') // roteou para a cloud
  expect(calls['cloud.decide']).toBe(1)
  expect(calls['local.decide']).toBeUndefined()
  expect(store.reserves).toBe(1) // reservou o slot atomicamente
  expect(store.releases).toBe(0) // sucesso → não estorna
})

test('no teto: decide cai para local.decide; reserveCall=false; releaseCall 1x (estorna a reserva especulativa)', async () => {
  const calls: Record<string, number> = {}
  const cloud = mockProvider('cloud', calls)
  const local = mockProvider('local', calls)
  const store = fakeStore(3) // já no teto

  const provider = withSpendCap(cloud, local, store, { maxCalls: 3 })
  const res = (await provider.decide(schema, messages)) as { action: string }

  expect(res.action).toBe('local') // fallback-to-local (D-08)
  expect(calls['cloud.decide']).toBeUndefined() // NÃO chamou a cloud
  expect(store.reserves).toBe(1) // tentou reservar (especulativo)
  expect(store.releases).toBe(1) // estornou o slot que não vai usar
})

test('erro real do cloud.decide: releaseCall é chamado no catch e o erro é re-lançado (D-10)', async () => {
  const calls: Record<string, number> = {}
  const cloud = throwingCloud(calls)
  const local = mockProvider('local', calls)
  const store = fakeStore(0)

  const provider = withSpendCap(cloud, local, store, { maxCalls: 3 })
  await expect(provider.decide(schema, messages)).rejects.toThrow('cloud boom')
  expect(calls['cloud.decide']).toBe(1)
  expect(store.reserves).toBe(1)
  expect(store.releases).toBe(1) // estorna no erro real (decisão de discrição D-10)
})

test('chat segue a mesma regra: sob o teto vai à cloud; no teto cai para local com estorno', async () => {
  const calls: Record<string, number> = {}
  const cloud = mockProvider('cloud', calls)
  const local = mockProvider('local', calls)

  const underStore = fakeStore(0)
  const under = withSpendCap(cloud, local, underStore, { maxCalls: 2 })
  expect(await under.chat(messages)).toBe('cloud')
  expect(calls['cloud.chat']).toBe(1)
  expect(underStore.releases).toBe(0)

  const overStore = fakeStore(2)
  const over = withSpendCap(cloud, local, overStore, { maxCalls: 2 })
  expect(await over.chat(messages)).toBe('local')
  expect(overStore.releases).toBe(1) // estornou
})

test('embed SEMPRE delega ao cloud — nunca chama reserveCall nem conta para o teto', async () => {
  const calls: Record<string, number> = {}
  const cloud = mockProvider('cloud', calls)
  const local = mockProvider('local', calls)
  const store = fakeStore(99) // bem acima do teto

  const provider = withSpendCap(cloud, local, store, { maxCalls: 3 })
  const vec = await provider.embed('texto')

  expect(vec).toEqual([1, 2, 3])
  expect(calls['cloud.embed']).toBe(1) // embed via cloud mesmo sob cap
  expect(calls['local.embed']).toBeUndefined()
  expect(store.reserves).toBe(0) // embed nunca reserva
})

test('available() reflete o provider roteado por getCallCount (probe, NÃO consome slot)', async () => {
  const calls: Record<string, number> = {}
  const cloud = mockProvider('cloud', calls)
  const local = mockProvider('local', calls)

  const underStore = fakeStore(0)
  const under = withSpendCap(cloud, local, underStore, { maxCalls: 1 })
  await under.available()
  expect(calls['cloud.available']).toBe(1)
  expect(calls['local.available']).toBeUndefined()
  expect(underStore.reserves).toBe(0) // available não reserva

  const over = withSpendCap(cloud, local, fakeStore(1), { maxCalls: 1 })
  await over.available()
  expect(calls['local.available']).toBe(1)
})
