// src/cognition/reflection.test.ts
// REFL-01: testes das PEÇAS puras da reflexão.
//  - shouldReflect: gatilho híbrido (event-driven / acúmulo / piso temporal).
//  - consolidate: promove CP→LP atomicamente (mesmo sem LLM) com importância alta.
//  - applyGoalUpdates: keep/drop/reprioritize com fallback no-op seguro.
import { test, expect, afterAll } from 'bun:test'
import { unlinkSync, existsSync } from 'node:fs'
import { openDb, EMBEDDING_DIM } from '../memory/persistence'
import { shouldReflect, consolidate, applyGoalUpdates } from './reflection'
import { config } from '../config'
import type { MemEvent } from './types'
import type { Goal } from '../motivation/types'
import type { ReflectionOutput } from '../llm/schemas'

// ───────────────────────── shouldReflect (gatilho híbrido) ─────────────────────────

test('shouldReflect: dispara por event-driven (enteredIdle && goalDoneOrFailed)', () => {
  expect(
    shouldReflect({
      enteredIdle: true,
      goalDoneOrFailed: true,
      importanceAccum: 0,
      lastReflectionAt: 1000,
      now: 1000,
    }),
  ).toBe(true)
})

test('shouldReflect: dispara por acúmulo de importância (>= threshold)', () => {
  expect(
    shouldReflect({
      enteredIdle: false,
      goalDoneOrFailed: false,
      importanceAccum: config.reflectionImportanceThreshold,
      lastReflectionAt: 0,
      now: 1,
    }),
  ).toBe(true)
})

test('shouldReflect: dispara por piso temporal (now - lastReflectionAt >= maxInterval)', () => {
  expect(
    shouldReflect({
      enteredIdle: false,
      goalDoneOrFailed: false,
      importanceAccum: 0,
      lastReflectionAt: 0,
      now: config.reflectionMaxIntervalMs,
    }),
  ).toBe(true)
})

test('shouldReflect: false quando nenhuma condição vale', () => {
  expect(
    shouldReflect({
      enteredIdle: true, // mas goalDoneOrFailed falso → não é event-driven
      goalDoneOrFailed: false,
      importanceAccum: config.reflectionImportanceThreshold - 1,
      lastReflectionAt: 0,
      now: config.reflectionMaxIntervalMs - 1,
    }),
  ).toBe(false)
})

// ───────────────────────── consolidate (CP→LP, DB) ─────────────────────────

const DB_PATH = './minemind.reflection.test.sqlite'

// Windows mantém o handle do SQLite (e WAL/SHM) por um instante após close() → unlink lança EBUSY.
function safeCleanup(): void {
  for (const f of [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`]) {
    if (existsSync(f)) {
      try {
        unlinkSync(f)
      } catch {
        // EBUSY no Windows: será removido no próximo run.
      }
    }
  }
}

safeCleanup()
afterAll(safeCleanup)

/** Embedding sintético de dimensão correta (sem chamar LM Studio). */
function synthEmbedding(peak: number): number[] {
  const v = new Array<number>(EMBEDDING_DIM).fill(0)
  v[peak % EMBEDDING_DIM] = 1
  return v
}

const recentEvents: MemEvent[] = [
  { type: 'world', event: 'damage', detail: 'zombie atacou', timestamp: 1000 },
  { type: 'action', skill: 'gather', target: 'oak_log', outcome: 'success', observed: 1, expected: 1, result: 'success', timestamp: 1100 },
  { type: 'state_transition', from: 'idle', to: 'exploring', timestamp: 1200 },
]

test('consolidate: sem LLM/summary promove UM evento episódico CP→LP (events), retorna id', () => {
  const db = openDb(DB_PATH)
  const before = (db.prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number }).n
  const id = consolidate(db, recentEvents, 2000, synthEmbedding(3))
  expect(id).not.toBeNull()

  const after = (db.prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number }).n
  expect(after).toBe(before + 1) // exatamente UM evento consolidado

  // Importância forçada alta — sobrevive ao floor e ao scoring.
  const row = db.prepare('SELECT importance, type, summary FROM events WHERE id = ?').get(id) as {
    importance: number
    type: string
    summary: string
  }
  expect(row.importance).toBeGreaterThanOrEqual(config.ltImportanceFloor)
  expect(row.importance).toBeGreaterThanOrEqual(8)

  // Plan 04: o vec0 foi aposentado — consolidate NÃO escreve mais em vec_events; o vetor vai
  // para o ChromaDB (responsabilidade do caller runReflection, fora desta função síncrona).
  const vecRow = db.prepare('SELECT COUNT(*) AS n FROM vec_events WHERE rowid = ?').get(id) as { n: number }
  expect(vecRow.n).toBe(0)
  db.close()
})

test('consolidate: com summary do LLM usa o summary como conteúdo do evento promovido', () => {
  const db = openDb(DB_PATH)
  const summary = 'Refleti: fui atacado por um zombie e coletei madeira; preciso de uma espada.'
  const id = consolidate(db, recentEvents, 3000, synthEmbedding(4), summary)
  expect(id).not.toBeNull()

  const row = db.prepare('SELECT summary FROM events WHERE id = ?').get(id) as { summary: string }
  expect(row.summary).toBe(summary)
  db.close()
})

test('consolidate: lista vazia de eventos retorna null (nada a consolidar)', () => {
  const db = openDb(DB_PATH)
  const before = (db.prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number }).n
  const id = consolidate(db, [], 4000, null)
  expect(id).toBeNull()
  const after = (db.prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number }).n
  expect(after).toBe(before)
  db.close()
})

test('consolidate: sem embedding ainda persiste o evento (degradação graciosa — vec0 aposentado)', () => {
  const db = openDb(DB_PATH)
  const before = (db.prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number }).n
  const id = consolidate(db, recentEvents, 5000, null)
  expect(id).not.toBeNull()
  const after = (db.prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number }).n
  expect(after).toBe(before + 1)
  const vecRow = db.prepare('SELECT COUNT(*) AS n FROM vec_events WHERE rowid = ?').get(id) as { n: number }
  expect(vecRow.n).toBe(0)
  db.close()
})

// ───────────────────────── applyGoalUpdates ─────────────────────────

function goal(id: string, priority: number): Goal {
  return { id, kind: 'resources', priority, progress: 0, dependsOn: [], source: 'need', committedAt: 0 }
}

test('applyGoalUpdates: drop remove o goal por id', () => {
  const goals = [goal('a', 0.5), goal('b', 0.6)]
  const updates: ReflectionOutput['goalUpdates'] = [{ id: 'a', action: 'drop' }]
  const out = applyGoalUpdates(goals, updates, 100)
  expect(out.map((g) => g.id)).toEqual(['b'])
})

test('applyGoalUpdates: reprioritize muda priority (com priority fornecido)', () => {
  const goals = [goal('a', 0.2)]
  const updates: ReflectionOutput['goalUpdates'] = [{ id: 'a', action: 'reprioritize', priority: 0.9 }]
  const out = applyGoalUpdates(goals, updates, 100)
  expect(out[0]!.priority).toBe(0.9)
})

test('applyGoalUpdates: clampa priority acima de 1 para 1', () => {
  const goals = [goal('a', 0.2)]
  const updates: ReflectionOutput['goalUpdates'] = [{ id: 'a', action: 'reprioritize', priority: 10 }]
  const out = applyGoalUpdates(goals, updates, 100)
  expect(out[0]!.priority).toBe(1)
})

test('applyGoalUpdates: clampa priority abaixo de 0 para 0', () => {
  const goals = [goal('a', 0.2)]
  const updates: ReflectionOutput['goalUpdates'] = [{ id: 'a', action: 'reprioritize', priority: -3 }]
  const out = applyGoalUpdates(goals, updates, 100)
  expect(out[0]!.priority).toBe(0)
})

test('applyGoalUpdates: reprioritize sem priority é no-op de prioridade (mantém goal)', () => {
  const goals = [goal('a', 0.2)]
  const updates: ReflectionOutput['goalUpdates'] = [{ id: 'a', action: 'reprioritize' }]
  const out = applyGoalUpdates(goals, updates, 100)
  expect(out[0]!.priority).toBe(0.2)
})

test('applyGoalUpdates: keep é no-op', () => {
  const goals = [goal('a', 0.5)]
  const updates: ReflectionOutput['goalUpdates'] = [{ id: 'a', action: 'keep' }]
  const out = applyGoalUpdates(goals, updates, 100)
  expect(out).toEqual(goals)
})

test('applyGoalUpdates: ids desconhecidos são ignorados', () => {
  const goals = [goal('a', 0.5)]
  const updates: ReflectionOutput['goalUpdates'] = [{ id: 'zzz', action: 'drop' }]
  const out = applyGoalUpdates(goals, updates, 100)
  expect(out.map((g) => g.id)).toEqual(['a'])
})

test('applyGoalUpdates: lista vazia => goals inalterados (fallback no-op seguro)', () => {
  const goals = [goal('a', 0.5), goal('b', 0.6)]
  const out = applyGoalUpdates(goals, [], 100)
  expect(out).toEqual(goals)
})

test('applyGoalUpdates: é imutável (não muta a entrada)', () => {
  const goals = [goal('a', 0.2)]
  applyGoalUpdates(goals, [{ id: 'a', action: 'reprioritize', priority: 0.9 }], 100)
  expect(goals[0]!.priority).toBe(0.2) // entrada original intacta
})
