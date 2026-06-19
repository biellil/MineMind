// src/llm/spendStore.test.ts
// PROV-05 / D-07 / D-09: contador de chamadas+tokens por janela diária em SQLite.
// Usa Database(':memory:') (mesmo padrão dos testes da Fase 4) — sem arquivo no disco.
import { test, expect } from 'bun:test'
import { Database } from 'bun:sqlite'
import { ensureSpendTable, windowKey, incrementCall, getCallCount } from './spendStore'

/** Timestamp UTC determinístico para um dado dia/hora (evita depender do relógio do CI). */
function ts(year: number, month: number, day: number, hour = 12): number {
  return Date.UTC(year, month - 1, day, hour, 0, 0, 0)
}

test('windowKey: mesmo dia UTC -> mesma chave; dias diferentes -> chaves diferentes', () => {
  const morning = ts(2026, 6, 19, 1)
  const evening = ts(2026, 6, 19, 23)
  const nextDay = ts(2026, 6, 20, 1)

  expect(windowKey(morning)).toBe(windowKey(evening)) // mesmo dia
  expect(windowKey(morning)).not.toBe(windowKey(nextDay)) // dia diferente
  expect(windowKey(morning)).toBe('2026-06-19') // formato YYYY-MM-DD
})

test('incrementCall: cria a linha (calls=1) e incrementa calls + soma tokens na mesma janela', () => {
  const db = new Database(':memory:')
  ensureSpendTable(db)
  const t = ts(2026, 6, 19)

  incrementCall(db, t, 10)
  expect(getCallCount(db, t)).toBe(1)

  incrementCall(db, t, 5)
  incrementCall(db, t, 0)
  expect(getCallCount(db, t)).toBe(3)

  // tokens acumulados na linha (10 + 5 + 0 = 15) — métrica de log (D-07).
  const row = db.prepare('SELECT tokens FROM llm_spend WHERE window_key = ?').get(windowKey(t)) as
    | { tokens: number }
    | null
  expect(row?.tokens).toBe(15)
})

test('getCallCount: 0 para janela inexistente; N após N increments na mesma janela', () => {
  const db = new Database(':memory:')
  ensureSpendTable(db)
  const t = ts(2026, 6, 19)

  expect(getCallCount(db, t)).toBe(0) // janela inexistente
  for (let i = 0; i < 4; i++) incrementCall(db, t)
  expect(getCallCount(db, t)).toBe(4)
})

test('janelas (dias) diferentes não se misturam — janela nova começa em 0', () => {
  const db = new Database(':memory:')
  ensureSpendTable(db)
  const day1 = ts(2026, 6, 19)
  const day2 = ts(2026, 6, 20)

  incrementCall(db, day1)
  incrementCall(db, day1)
  expect(getCallCount(db, day1)).toBe(2)
  expect(getCallCount(db, day2)).toBe(0) // dia novo isolado

  incrementCall(db, day2)
  expect(getCallCount(db, day2)).toBe(1)
  expect(getCallCount(db, day1)).toBe(2) // dia 1 intacto
})

test('incrementCall/getCallCount são robustos sem ensureSpendTable explícito (auto-DDL)', () => {
  const db = new Database(':memory:')
  const t = ts(2026, 6, 19)
  // sem chamar ensureSpendTable — as funções garantem a tabela internamente.
  expect(getCallCount(db, t)).toBe(0)
  incrementCall(db, t)
  expect(getCallCount(db, t)).toBe(1)
})
