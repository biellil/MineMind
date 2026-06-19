// src/memory/shortTerm.test.ts
// MEM-01 / D-12 / D-13: testes do ring buffer com orçamento de tokens estimado.
import { test, expect } from 'bun:test'
import {
  createMemory,
  push,
  estimateTokens,
  totalTokens,
  getEvents,
  DEFAULT_TOKEN_BUDGET,
} from './shortTerm'
import type { MemEvent } from '../cognition/types'
import { getEncoding } from 'js-tiktoken'

const enc = getEncoding('o200k_base')

function worldEvent(ts: number): MemEvent {
  return { type: 'world', event: 'damage', detail: `dano em ${ts}`, timestamp: ts }
}

test('createMemory inicia vazio com o orçamento informado', () => {
  const mem = createMemory(1000)
  expect(mem.budget).toBe(1000)
  expect(getEvents(mem).length).toBe(0)
  expect(totalTokens(mem)).toBe(0)
})

test('createMemory usa DEFAULT_TOKEN_BUDGET quando omitido', () => {
  const mem = createMemory()
  expect(mem.budget).toBe(DEFAULT_TOKEN_BUDGET)
})

test('estimateTokens usa js-tiktoken o200k_base (contagem real de tokens)', () => {
  const e = worldEvent(1)
  const expected = enc.encode(JSON.stringify(e)).length
  expect(estimateTokens(e)).toBe(expected)
  expect(estimateTokens(e)).toBeGreaterThan(0)
})

test('push dentro do orçamento mantém o evento (length cresce)', () => {
  const m0 = createMemory(1000)
  const m1 = push(m0, worldEvent(1))
  expect(getEvents(m1).length).toBe(1)
  const m2 = push(m1, worldEvent(2))
  expect(getEvents(m2).length).toBe(2)
})

test('push é imutável — não muta a memória de entrada', () => {
  const m0 = createMemory(1000)
  push(m0, worldEvent(1))
  expect(getEvents(m0).length).toBe(0)
})

test('getEvents retorna em ordem cronológica (mais antigo primeiro)', () => {
  let mem = createMemory(1000)
  mem = push(mem, worldEvent(10))
  mem = push(mem, worldEvent(20))
  mem = push(mem, worldEvent(30))
  const ts = getEvents(mem).map((e) => e.timestamp)
  expect(ts).toEqual([10, 20, 30])
})

test('evicção FIFO ao estourar o orçamento: o de menor timestamp sai primeiro', () => {
  // Orçamento pequeno força evicção. Com js-tiktoken cada world event ~= 21 tokens,
  // então um budget que comporta ~2 eventos garante que os mais antigos saiam mas alguns fiquem.
  const budget = 2 * estimateTokens(worldEvent(1)) + 5
  let mem = createMemory(budget)
  mem = push(mem, worldEvent(1))
  mem = push(mem, worldEvent(2))
  mem = push(mem, worldEvent(3))
  mem = push(mem, worldEvent(4))
  mem = push(mem, worldEvent(5))
  // Com o orçamento acima, alguns eventos permanecem (não evicta tudo).
  expect(getEvents(mem).length).toBeGreaterThan(0)
  // O evento original mais antigo (timestamp 1) NÃO deve ser o primeiro mais.
  expect(getEvents(mem)[0]!.timestamp).not.toBe(1)
  // Ainda em ordem cronológica crescente.
  const ts = getEvents(mem).map((e) => e.timestamp)
  const sorted = [...ts].sort((a, b) => a - b)
  expect(ts).toEqual(sorted)
})

test('totalTokens nunca excede o orçamento após um push', () => {
  const budget = 3 * estimateTokens(worldEvent(1)) + 5
  let mem = createMemory(budget)
  for (let i = 1; i <= 10; i++) {
    mem = push(mem, worldEvent(i))
    expect(totalTokens(mem)).toBeLessThanOrEqual(budget)
  }
})
