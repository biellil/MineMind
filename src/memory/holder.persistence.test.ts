// src/memory/holder.persistence.test.ts
// MEM-02 / D-04 / D-19: prova a persistência do ESTADO VIVO (needs/goals/currentGoal/
// disposition/personality) por round-trip num arquivo SQLite real, e o decay-on-boot:
//  - curiosity re-decai por timestamp no hydrate (survival/resources NÃO — recomputados no 1º tick)
//  - goals com committedAt velho (> goalStaleMs) são descartados; currentGoal descartado vira null
//  - personality passa por mean-reversion (decayPersonality) no hydrate
//  - db null é no-op gracioso (não lança)
import { test, expect, afterAll } from 'bun:test'
import { unlinkSync, existsSync, readdirSync } from 'node:fs'
import { openDb } from './persistence'
import { persistHolder, hydrateHolder } from './holder.persistence'
import { createCognitiveStateHolder } from '../cognition/state'
import { config } from '../config'
import type { Goal } from '../motivation/types'

const DB_PATH = './minemind.holder.test.sqlite'

// Windows mantém o handle do SQLite/WAL por um instante após db.close(); unlink direto pode lançar
// EBUSY. Guardamos a remoção e varremos todos os artefatos (-wal/-shm inclusos).
function safeCleanup(): void {
  const prefix = 'minemind.holder.test.sqlite'
  let targets: string[] = []
  try {
    targets = readdirSync('.').filter((f) => f.startsWith(prefix)).map((f) => `./${f}`)
  } catch {
    // diretório ilegível: ignora
  }
  for (const f of targets) {
    if (existsSync(f)) {
      try {
        unlinkSync(f)
      } catch {
        // EBUSY no Windows: removido no próximo run.
      }
    }
  }
}

safeCleanup()
afterAll(safeCleanup)

function freshGoal(id: string, committedAt: number): Goal {
  return { id, kind: 'gather', priority: 1, progress: 0, dependsOn: [], source: 'need', committedAt }
}

test('cold start: hydrateHolder num DB sem snapshot retorna o holder base inalterado (D-03)', () => {
  safeCleanup()
  const db = openDb(DB_PATH)
  const holder = createCognitiveStateHolder(1000)
  const goalsBefore = holder.goals
  const result = hydrateHolder(db, holder, 2000)
  expect(result).toBe(holder)
  expect(result.goals).toEqual(goalsBefore)
  expect(result.currentGoal).toBeNull()
  expect(result.needs).toHaveLength(5)
  db.close()
})

test('round-trip: persistHolder + reabrir + hydrateHolder restaura o estado vivo (MEM-02)', () => {
  safeCleanup()
  const now = 100_000
  const db1 = openDb(DB_PATH)
  const holder = createCognitiveStateHolder(now)
  const goal = freshGoal('need:resources', now)
  holder.goals = [goal]
  holder.currentGoal = goal
  holder.disposition = 'ASSISTANT'
  holder.personality = { mood: 0.3, socialEnergy: 0.5, confidence: 0.7, updatedAt: now }
  persistHolder(db1, holder, now)
  db1.close()

  // Reabre o MESMO arquivo (simula RESTART do processo) e hidrata um holder fresco.
  const db2 = openDb(DB_PATH)
  const restored = createCognitiveStateHolder(now)
  hydrateHolder(db2, restored, now) // mesmo `now` → sem decay temporal
  expect(restored.goals).toHaveLength(1)
  expect(restored.goals[0]!.id).toBe('need:resources')
  expect(restored.currentGoal?.id).toBe('need:resources')
  expect(restored.disposition).toBe('ASSISTANT')
  expect(restored.personality.mood).toBeCloseTo(0.3, 5)
  expect(restored.personality.confidence).toBeCloseTo(0.7, 5)
  db2.close()
})

test('decay-on-boot: curiosity re-decai por timestamp; survival/resources NÃO mexem no hydrate (D-19)', () => {
  safeCleanup()
  const t0 = 1_000_000
  const db1 = openDb(DB_PATH)
  const holder = createCognitiveStateHolder(t0)
  // curiosity alta + lastSatisfiedAt antigo; survival/resources com valores arbitrários.
  holder.needs = holder.needs.map((n) => {
    if (n.kind === 'curiosity') return { ...n, value: 1, lastSatisfiedAt: t0 }
    if (n.kind === 'survival') return { ...n, value: 0.42, lastSatisfiedAt: t0 }
    if (n.kind === 'resources') return { ...n, value: 0.33, lastSatisfiedAt: t0 }
    return n
  })
  persistHolder(db1, holder, t0)
  db1.close()

  const elapsed = 60_000 // 1 min depois
  const db2 = openDb(DB_PATH)
  const restored = createCognitiveStateHolder(t0)
  hydrateHolder(db2, restored, t0 + elapsed)
  const curiosity = restored.needs.find((n) => n.kind === 'curiosity')!
  const survival = restored.needs.find((n) => n.kind === 'survival')!
  const resources = restored.needs.find((n) => n.kind === 'resources')!
  // curiosity decaiu por timestamp (e ainda >= 0)
  const expectedCuriosity = Math.max(0, 1 - config.curiosityDecayPerMs * elapsed)
  expect(curiosity.value).toBeCloseTo(expectedCuriosity, 6)
  expect(curiosity.value).toBeLessThan(1)
  expect(curiosity.value).toBeGreaterThanOrEqual(0)
  // survival/resources preservados (serão recomputados no 1º tick via evaluateNeeds — no-op aqui)
  expect(survival.value).toBeCloseTo(0.42, 6)
  expect(resources.value).toBeCloseTo(0.33, 6)
  db2.close()
})

test('decay-on-boot: curiosity com clamp >= 0 mesmo com tempo enorme (D-19)', () => {
  safeCleanup()
  const t0 = 5_000_000
  const db1 = openDb(DB_PATH)
  const holder = createCognitiveStateHolder(t0)
  holder.needs = holder.needs.map((n) =>
    n.kind === 'curiosity' ? { ...n, value: 0.5, lastSatisfiedAt: t0 } : n,
  )
  persistHolder(db1, holder, t0)
  db1.close()

  const db2 = openDb(DB_PATH)
  const restored = createCognitiveStateHolder(t0)
  hydrateHolder(db2, restored, t0 + 10 ** 12) // tempo absurdo
  const curiosity = restored.needs.find((n) => n.kind === 'curiosity')!
  expect(curiosity.value).toBe(0)
  db2.close()
})

test('decay-on-boot: goal velho (> goalStaleMs) é descartado; recente é mantido (D-19)', () => {
  safeCleanup()
  const now = 10_000_000
  const db1 = openDb(DB_PATH)
  const holder = createCognitiveStateHolder(now)
  const oldGoal = freshGoal('need:old', now - config.goalStaleMs - 1)
  const freshG = freshGoal('need:fresh', now)
  holder.goals = [oldGoal, freshG]
  holder.currentGoal = null
  persistHolder(db1, holder, now)
  db1.close()

  const db2 = openDb(DB_PATH)
  const restored = createCognitiveStateHolder(now)
  hydrateHolder(db2, restored, now)
  expect(restored.goals).toHaveLength(1)
  expect(restored.goals[0]!.id).toBe('need:fresh')
  db2.close()
})

test('decay-on-boot: currentGoal descartado vira null; sobrevivente é mantido (D-19)', () => {
  safeCleanup()
  const now = 20_000_000

  // (a) currentGoal aponta para um goal velho → vira null
  const db1 = openDb(DB_PATH)
  const h1 = createCognitiveStateHolder(now)
  const stale = freshGoal('need:stale', now - config.goalStaleMs - 1)
  h1.goals = [stale]
  h1.currentGoal = stale
  persistHolder(db1, h1, now)
  db1.close()

  const db2 = openDb(DB_PATH)
  const r1 = createCognitiveStateHolder(now)
  hydrateHolder(db2, r1, now)
  expect(r1.currentGoal).toBeNull()
  expect(r1.goals).toHaveLength(0)
  db2.close()

  // (b) currentGoal sobrevive → mantido
  safeCleanup()
  const db3 = openDb(DB_PATH)
  const h2 = createCognitiveStateHolder(now)
  const alive = freshGoal('need:alive', now)
  h2.goals = [alive]
  h2.currentGoal = alive
  persistHolder(db3, h2, now)
  db3.close()

  const db4 = openDb(DB_PATH)
  const r2 = createCognitiveStateHolder(now)
  hydrateHolder(db4, r2, now)
  expect(r2.currentGoal?.id).toBe('need:alive')
  db4.close()
})

test('decay-on-boot: personality reverte à baseline (mean-reversion) no hydrate (D-19)', () => {
  safeCleanup()
  const t0 = 30_000_000
  const db1 = openDb(DB_PATH)
  const holder = createCognitiveStateHolder(t0)
  holder.personality = { mood: 0.8, socialEnergy: 0.2, confidence: 0.9, updatedAt: t0 }
  persistHolder(db1, holder, t0)
  db1.close()

  const db2 = openDb(DB_PATH)
  const restored = createCognitiveStateHolder(t0)
  // muito tempo depois → mood→0, confidence→0.5, socialEnergy recarrega
  hydrateHolder(db2, restored, t0 + 10 ** 9)
  expect(restored.personality.mood).toBe(0)
  expect(restored.personality.confidence).toBe(0.5)
  expect(restored.personality.socialEnergy).toBe(1)
  db2.close()
})

test('db null: persistHolder e hydrateHolder são no-op graciosos (não lançam)', () => {
  const holder = createCognitiveStateHolder(0)
  holder.goals = [freshGoal('x', 0)]
  expect(() => persistHolder(null, holder, 0)).not.toThrow()
  const result = hydrateHolder(null, holder, 0)
  expect(result).toBe(holder)
  expect(result.goals).toHaveLength(1)
})
