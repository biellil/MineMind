// src/llm/spendCap.test.ts
// PROV-05 / D-06 / D-07 / D-08: decorator withSpendCap (hard-cap -> fallback-to-local).
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

/** SpendStore fake in-memory com contador fixo configurável e rastreio de increments. */
function fakeStore(initialCount: number): SpendStore & { count: number; increments: number } {
  return {
    count: initialCount,
    increments: 0,
    getCallCount(_now: number): number {
      return this.count
    },
    incrementCall(_now: number, _tokens?: number): void {
      this.count += 1
      this.increments += 1
    },
  }
}

test('abaixo do teto: decide chama cloud.decide e incrementa o contador 1x', async () => {
  const calls: Record<string, number> = {}
  const cloud = mockProvider('cloud', calls)
  const local = mockProvider('local', calls)
  const store = fakeStore(0)

  const provider = withSpendCap(cloud, local, store, { maxCalls: 3 })
  const res = (await provider.decide(schema, messages)) as { action: string }

  expect(res.action).toBe('cloud') // roteou para a cloud
  expect(calls['cloud.decide']).toBe(1)
  expect(calls['local.decide']).toBeUndefined()
  expect(store.increments).toBe(1) // contou a chamada cloud
})

test('no teto (>=maxCalls): decide cai para local.decide SEM incrementar o contador cloud', async () => {
  const calls: Record<string, number> = {}
  const cloud = mockProvider('cloud', calls)
  const local = mockProvider('local', calls)
  const store = fakeStore(3) // já no teto

  const provider = withSpendCap(cloud, local, store, { maxCalls: 3 })
  const res = (await provider.decide(schema, messages)) as { action: string }

  expect(res.action).toBe('local') // fallback-to-local (D-08)
  expect(calls['cloud.decide']).toBeUndefined() // NÃO chamou a cloud
  expect(store.increments).toBe(0) // não conta o fallback
})

test('chat segue a mesma regra do teto (cap -> local.chat)', async () => {
  const calls: Record<string, number> = {}
  const cloud = mockProvider('cloud', calls)
  const local = mockProvider('local', calls)

  const under = withSpendCap(cloud, local, fakeStore(0), { maxCalls: 2 })
  expect(await under.chat(messages)).toBe('cloud')
  expect(calls['cloud.chat']).toBe(1)

  const over = withSpendCap(cloud, local, fakeStore(2), { maxCalls: 2 })
  expect(await over.chat(messages)).toBe('local')
})

test('embed SEMPRE delega ao cloud (local por composição no Plano 01) — nunca conta para o teto', async () => {
  const calls: Record<string, number> = {}
  const cloud = mockProvider('cloud', calls)
  const local = mockProvider('local', calls)
  const store = fakeStore(99) // bem acima do teto

  const provider = withSpendCap(cloud, local, store, { maxCalls: 3 })
  const vec = await provider.embed('texto')

  expect(vec).toEqual([1, 2, 3])
  expect(calls['cloud.embed']).toBe(1) // embed via cloud mesmo sob cap
  expect(calls['local.embed']).toBeUndefined()
  expect(store.increments).toBe(0) // embed não conta
})

test('available() reflete o provider roteado (sob cap -> local.available)', async () => {
  const calls: Record<string, number> = {}
  const cloud = mockProvider('cloud', calls)
  const local = mockProvider('local', calls)

  const under = withSpendCap(cloud, local, fakeStore(0), { maxCalls: 1 })
  await under.available()
  expect(calls['cloud.available']).toBe(1)
  expect(calls['local.available']).toBeUndefined()

  const over = withSpendCap(cloud, local, fakeStore(1), { maxCalls: 1 })
  await over.available()
  expect(calls['local.available']).toBe(1)
})
