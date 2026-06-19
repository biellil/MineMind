// src/llm/structured.test.ts
// LLM-02 / D-17: decideAction com repair/retry + fallback determinístico que NUNCA lança.
import { test, expect } from 'bun:test'
import { decideAction } from './structured'
import type { LlmProvider } from './provider'
import type { ActionDecision } from './schemas'
import type { BaseMessage } from '@langchain/core/messages'
import { HumanMessage } from '@langchain/core/messages'
import type { ZodType } from 'zod'

const messages: BaseMessage[] = [new HumanMessage('decida sua próxima ação')]

const FALLBACK: ActionDecision = { action: 'idle', reason: 'fallback determinístico' }
const fallback = (): ActionDecision => FALLBACK

const VALID: ActionDecision = { action: 'gather', target: 'oak_log', reason: 'preciso de madeira' }

/** Constrói um LlmProvider MOCK (sem rede) com comportamento configurável. */
function mockProvider(opts: {
  available: boolean
  decide?: () => Promise<unknown>
}): LlmProvider {
  return {
    available: async () => opts.available,
    chat: async () => 'noop',
    decide: opts.decide
      ? (async () => opts.decide!()) as LlmProvider['decide']
      : (async () => {
          throw new Error('decide não configurado')
        }) as LlmProvider['decide'],
  }
}

test('available=false -> retorna fallback SEM chamar decide', async () => {
  let decideCalled = false
  const provider = mockProvider({
    available: false,
    decide: async () => {
      decideCalled = true
      return VALID
    },
  })
  const result = await decideAction(provider, messages, fallback)
  expect(result).toEqual(FALLBACK)
  expect(decideCalled).toBe(false)
})

test('decide retorna objeto válido -> retorna o objeto parseado', async () => {
  const provider = mockProvider({ available: true, decide: async () => VALID })
  const result = await decideAction(provider, messages, fallback)
  expect(result.action).toBe('gather')
  expect(result.target).toBe('oak_log')
})

test('decide lança na 1ª tentativa mas o retry retorna válido -> retorna o reparado', async () => {
  let calls = 0
  const provider = mockProvider({
    available: true,
    decide: async () => {
      calls += 1
      if (calls === 1) throw new Error('json inválido')
      return VALID
    },
  })
  const result = await decideAction(provider, messages, fallback)
  expect(result.action).toBe('gather')
  expect(calls).toBe(2) // 1ª falhou, retry teve sucesso
})

test('ambas as tentativas falham -> retorna fallback', async () => {
  const provider = mockProvider({
    available: true,
    decide: async () => {
      throw new Error('sempre falha')
    },
  })
  const result = await decideAction(provider, messages, fallback)
  expect(result).toEqual(FALLBACK)
})

test('decide retorna ação fora do enum -> repair, e se persistir -> fallback', async () => {
  const provider = mockProvider({
    available: true,
    decide: async () => ({ action: 'fly', reason: 'inválido' }), // inválido nas duas tentativas
  })
  const result = await decideAction(provider, messages, fallback)
  expect(result).toEqual(FALLBACK)
})

test('decideAction NUNCA rejeita (sempre resolve)', async () => {
  const providers = [
    mockProvider({ available: false }),
    mockProvider({ available: true, decide: async () => VALID }),
    mockProvider({
      available: true,
      decide: async () => {
        throw new Error('boom')
      },
    }),
  ]
  for (const provider of providers) {
    await expect(decideAction(provider, messages, fallback)).resolves.toBeDefined()
  }
})
