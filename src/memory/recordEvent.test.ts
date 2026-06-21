// src/memory/recordEvent.test.ts
// D-06/D-08: testes do helper central de gravação de eventos. Cobre os 4 comportamentos do <behavior>:
//  1. holder.db válido → push em CP E persistEvent em LP (events count reflete, se importance >= floor).
//  2. holder.db === null → ainda empurra em CP e NÃO lança (degradação graciosa).
//  3. reatribui holder.memory (ring buffer imutável) — o novo evento aparece em getEvents.
//  4. NUNCA lança mesmo se persistEvent falhar (try/catch interno) — o tick nunca aborta (Core Value).
import { test, expect } from 'bun:test'
import { Database } from 'bun:sqlite'
import { openDb } from './persistence'
import { getEvents } from './shortTerm'
import { createCognitiveStateHolder } from '../cognition/state'
import { recordEvent } from './recordEvent'
import type { MemEvent } from '../cognition/types'

// Evento com importance alta (>= floor): world/damage → importanceOf = 9.
function highImportanceEvent(now: number): MemEvent {
  return { type: 'world', event: 'damage', detail: 'mob', timestamp: now }
}

test('Test 1: holder.db válido → push em CP E persiste em LP (events count > 0)', () => {
  const now = Date.now()
  const holder = createCognitiveStateHolder(now)
  holder.db = openDb(':memory:')

  recordEvent(holder, highImportanceEvent(now), now)

  // CP: evento empurrado na memória.
  expect(getEvents(holder.memory).length).toBe(1)
  // LP: persistEvent gravou na tabela events.
  const row = holder.db.prepare('SELECT count(*) AS n FROM events').get() as { n: number }
  expect(row.n).toBe(1)

  holder.db.close()
})

test('Test 2: holder.db === null → empurra em CP e NÃO lança (degradação graciosa)', () => {
  const now = Date.now()
  const holder = createCognitiveStateHolder(now)
  holder.db = null

  expect(() => recordEvent(holder, highImportanceEvent(now), now)).not.toThrow()
  expect(getEvents(holder.memory).length).toBe(1)
})

test('Test 3: reatribui holder.memory (ring buffer imutável) — getEvents inclui o último', () => {
  const now = Date.now()
  const holder = createCognitiveStateHolder(now)
  holder.db = null
  const before = holder.memory

  const e = highImportanceEvent(now)
  recordEvent(holder, e, now)

  // holder.memory foi reatribuído (nova referência) e contém o novo evento.
  expect(holder.memory).not.toBe(before)
  const events = getEvents(holder.memory)
  expect(events[events.length - 1]).toEqual(e)
})

test('Test 4: NUNCA lança mesmo se persistEvent falhar (try/catch interno)', () => {
  const now = Date.now()
  const holder = createCognitiveStateHolder(now)
  // DB sem o schema events → persistEvent vai lançar (no such table); recordEvent deve engolir.
  holder.db = new Database(':memory:')

  expect(() => recordEvent(holder, highImportanceEvent(now), now)).not.toThrow()
  // CP ainda recebeu o evento mesmo com a falha de LP.
  expect(getEvents(holder.memory).length).toBe(1)

  holder.db.close()
})
