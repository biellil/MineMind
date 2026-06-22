// src/cognition/deliberation.recall.test.ts
// Plan 08.1-05 Task 2: caminho de AÇÃO recupera memórias por embedding(currentGoal) CACHEADO (D-11)
// e loga [recall] por memória recuperada (D-13). Cobre os 4 comportamentos:
//   1. mesmo goal -> provider.embed chamado UMA vez (cache hit na 2ª chamada).
//   2. trocar o goal (hash diferente) -> re-embed e atualiza o cache.
//   3. currentGoal null -> query embedding null (retrieve cairia no fallback de recência).
//   4. log [recall] é emitido por memória recuperada (id, score, summary truncado).
import { test, expect, afterAll } from 'bun:test'
import { unlinkSync, existsSync, readdirSync } from 'node:fs'
import { Database } from 'bun:sqlite'
import { computeGoalQueryEmbedding, maybeDeliberate, createDeliberator } from './deliberation'
import { createCognitiveStateHolder } from './state'
import { persistEvent } from '../memory/longTerm'
import type { LlmProvider } from '../llm/provider'
import type { WorldSnapshot } from '../perception/types'
import type { Goal } from '../motivation/types'
import type { MemEvent } from './types'

const DB_PREFIX = 'minemind.recall.test'
const dbPathFor = (s: string): string => `./${DB_PREFIX}.${s}.test.sqlite`

function safeCleanup(): void {
  let targets: string[] = []
  try {
    targets = readdirSync('.').filter((f) => f.startsWith(DB_PREFIX)).map((f) => `./${f}`)
  } catch {
    // ignore
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

const snapshot: WorldSnapshot = {
  capturedAt: 0,
  status: { health: 20, food: 20, position: { x: 0, y: 64, z: 0 }, timeOfDay: 1000, isDay: true },
  entities: [],
  players: [],
  nearbyBlockTypes: {},
  inventory: [],
  lookingAt: null,
  underfoot: 'unknown',
}

const dim = 768
function embeddingVec(seed: number): number[] {
  return Array.from({ length: dim }, () => seed)
}

/** Provider fake com contador de embed (espionável) — embed sempre disponível. */
function spyProvider(): { provider: LlmProvider; embedCalls: () => number } {
  let calls = 0
  const provider: LlmProvider = {
    maxConcurrency: 1,
    available: async () => true,
    decide: async () => ({ action: 'idle', reason: 'fallback:test' }) as never,
    chat: async () => '',
    embed: async () => {
      calls += 1
      return embeddingVec(1)
    },
  }
  return { provider, embedCalls: () => calls }
}

function goal(id: string): Goal {
  return { id, kind: 'gather', target: id, priority: 1, progress: 0, createdAt: 0 } as unknown as Goal
}

// === Test 1: mesmo goal -> embed UMA vez (cache) ===
test('computeGoalQueryEmbedding: mesmo goal não re-chama provider.embed (cache D-11)', async () => {
  const { provider, embedCalls } = spyProvider()
  const holder = createCognitiveStateHolder(0)
  holder.currentGoal = goal('oak_log')

  const a = await computeGoalQueryEmbedding(holder, provider)
  const b = await computeGoalQueryEmbedding(holder, provider)

  expect(a).not.toBeNull()
  expect(b).toBe(a) // mesma referência cacheada
  expect(embedCalls()).toBe(1)
})

// === Test 2: trocar o goal -> re-embed ===
test('computeGoalQueryEmbedding: trocar o goal re-chama embed e atualiza o cache', async () => {
  const { provider, embedCalls } = spyProvider()
  const holder = createCognitiveStateHolder(0)

  holder.currentGoal = goal('oak_log')
  await computeGoalQueryEmbedding(holder, provider)
  const hash1 = holder.queryEmbeddingHash

  holder.currentGoal = goal('cobblestone')
  await computeGoalQueryEmbedding(holder, provider)
  const hash2 = holder.queryEmbeddingHash

  expect(embedCalls()).toBe(2)
  expect(hash2).not.toBe(hash1)
})

// === Test 3: currentGoal null -> query embedding null ===
test('computeGoalQueryEmbedding: currentGoal null retorna null sem chamar embed', async () => {
  const { provider, embedCalls } = spyProvider()
  const holder = createCognitiveStateHolder(0)
  holder.currentGoal = null

  const emb = await computeGoalQueryEmbedding(holder, provider)

  expect(emb).toBeNull()
  expect(embedCalls()).toBe(0)
})

// === Test 4: log [recall] por memória recuperada ===
test('caminho de AÇÃO emite log [recall] por memória recuperada', async () => {
  const dbPath = dbPathFor('log')
  const db = new Database(dbPath)
  // esquema mínimo da tabela events usada por retrieve/persistEvent.
  db.exec(`CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT, ts INTEGER, importance INTEGER,
    summary TEXT, payload TEXT, player TEXT, last_access INTEGER
  )`)

  const dmg: MemEvent = { type: 'world', event: 'damage', detail: 'caiu de altura', timestamp: 1 }
  const cmd: MemEvent = { type: 'chat_command', from: 'steve', command: 'venha', mode: 'autonomous', timestamp: 2 }
  persistEvent(db, dmg, null, 10)
  persistEvent(db, cmd, null, 10)

  const { provider } = spyProvider()
  const holder = createCognitiveStateHolder(0)
  holder.db = db
  holder.currentGoal = goal('oak_log')

  const logs: string[] = []
  const origLog = console.log
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(' '))
  }

  try {
    const { state } = createDeliberator()
    state.lastRunAt = -Infinity
    // chroma null -> retrieve cai no fallback de recência (sem servidor), ainda retorna eventos.
    await maybeDeliberate(state, holder, provider, snapshot, 'goal_changed', 100, null)
  } finally {
    console.log = origLog
    db.close()
  }

  const recallLogs = logs.filter((l) => l.includes('[recall]'))
  expect(recallLogs.length).toBeGreaterThan(0)
})
