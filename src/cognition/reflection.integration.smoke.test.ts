// src/cognition/reflection.integration.smoke.test.ts
// REFL-01 / Plan 04-07 Task 2: smoke headless do WIRING da reflexão (sem servidor MC nem LM Studio).
//
// Prova as três propriedades estruturais do ramo de reflexão da deliberação single-flight:
//   A) com um provider FAKE (available:true + decide -> ReflectionOutput válido), runReflection
//      consolida CP→LP (UM evento episódico em `events`) e faz flush da mente (kv['holder']).
//   B) com provider OFF (available:false), runReflection AINDA consolida deterministicamente
//      (sem lançar) e os goals ficam inalterados (fallback no-op).
//   C) single-flight: duas chamadas concorrentes de maybeDeliberate('reflect') NÃO rodam duas
//      reflexões simultâneas (a 2ª retorna cedo por inFlight).
import { test, expect, afterAll } from 'bun:test'
import { unlinkSync, existsSync, readdirSync } from 'node:fs'
import { openDb, kvGet } from '../memory/persistence'
import { push } from '../memory/shortTerm'
import { createCognitiveStateHolder } from './state'
import { createDeliberator, runReflection } from './deliberation'
import type { LlmProvider } from '../llm/provider'
import type { WorldSnapshot } from '../perception/types'
import type { MemEvent } from './types'
import type { Database } from 'bun:sqlite'

const DB_PREFIX = 'minemind.reflection.smoke'
// Cada teste usa um arquivo PRÓPRIO: no Windows o handle do WAL fica preso por um instante após
// db.close() (EBUSY), então reusar o mesmo arquivo entre testes vazaria linhas. Sufixo único isola.
// O nome termina em `.test.sqlite` para casar o padrão `*.test.sqlite` do .gitignore.
const dbPathFor = (suffix: string): string => `./${DB_PREFIX}.${suffix}.test.sqlite`

// Windows mantém o handle do SQLite/WAL por um instante após db.close(); unlink direto pode lançar
// EBUSY. Guardamos a remoção e varremos -wal/-shm.
function safeCleanup(): void {
  let targets: string[] = []
  try {
    targets = readdirSync('.').filter((f) => f.startsWith(DB_PREFIX)).map((f) => `./${f}`)
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

// snapshot mínimo (serializeContext só lê campos).
const snapshot: WorldSnapshot = {
  capturedAt: 0,
  status: { health: 20, food: 20, position: { x: 0, y: 64, z: 0 }, timeOfDay: 1000, isDay: true },
  entities: [],
  players: [],
  nearbyBlockTypes: {},
  inventory: [],
}

function actionEvent(target: string, ts: number): MemEvent {
  return { type: 'action', skill: 'gather', target, result: 'success', timestamp: ts }
}

function damageEvent(ts: number): MemEvent {
  return { type: 'world', event: 'damage', detail: 'caiu', timestamp: ts }
}

function holderWithEvents(db: Database | null): ReturnType<typeof createCognitiveStateHolder> {
  const h = createCognitiveStateHolder(0)
  h.db = db
  // alguns eventos recentes para consolidar (importância variada).
  h.memory = push(h.memory, actionEvent('oak_log', 1))
  h.memory = push(h.memory, damageEvent(2))
  h.memory = push(h.memory, actionEvent('cobblestone', 3))
  return h
}

// FAKE provider: available true, decide devolve um ReflectionOutput válido, embed devolve [] (sem vec).
function fakeOnProvider(): LlmProvider {
  return {
    available: async () => true,
    decide: async () => ({ summary: 'Refleti sobre coleta e dano.', goalUpdates: [] }) as never,
    chat: async () => '',
    embed: async () => [],
  }
}

const offProvider: LlmProvider = {
  available: async () => false,
  decide: async () => {
    throw new Error('LLM off — decide não deveria ser chamado')
  },
  chat: async () => '',
  embed: async () => [],
}

// ---------------------------------------------------------------------------
// A) provider FAKE -> consolida CP→LP (events) + flush da mente (kv['holder']).
// ---------------------------------------------------------------------------
test('A) runReflection com provider fake: consolida 1 evento em LP e faz flush do holder', async () => {
  const db = openDb(dbPathFor('a'))
  const holder = holderWithEvents(db)

  await runReflection(holder, fakeOnProvider(), snapshot, 1000)

  // consolidação CP→LP: ao menos um evento episódico foi persistido em `events`.
  const row = db.prepare(`SELECT COUNT(*) AS n FROM events`).get() as { n: number }
  expect(row.n).toBeGreaterThanOrEqual(1)
  // o evento consolidado tem type='reflection'.
  const refl = db.prepare(`SELECT COUNT(*) AS n FROM events WHERE type = 'reflection'`).get() as {
    n: number
  }
  expect(refl.n).toBe(1)

  // flush da mente: kv['holder'] gravado (D-02).
  expect(kvGet(db, 'holder')).toBeDefined()

  db.close()
})

// ---------------------------------------------------------------------------
// B) provider OFF -> consolida deterministicamente (sem lançar), goals inalterados.
// ---------------------------------------------------------------------------
test('B) runReflection com LLM off: ainda consolida (determinístico) e não muta goals', async () => {
  const db = openDb(dbPathFor('b'))
  const holder = holderWithEvents(db)
  holder.goals = [
    { id: 'g1', kind: 'gather', priority: 1, progress: 0, dependsOn: [], source: 'need', committedAt: 0 },
  ]

  // não deve lançar mesmo com o LLM off.
  await runReflection(holder, offProvider, snapshot, 2000)

  // consolidação determinística aconteceu mesmo sem LLM (D-13).
  const refl = db.prepare(`SELECT COUNT(*) AS n FROM events WHERE type = 'reflection'`).get() as {
    n: number
  }
  expect(refl.n).toBe(1)
  // goals inalterados (fallback no-op — updates vazio).
  expect(holder.goals).toHaveLength(1)
  expect(holder.goals[0]!.id).toBe('g1')

  db.close()
})

// ---------------------------------------------------------------------------
// C) single-flight: 2 chamadas concorrentes de maybeDeliberate('reflect') não sobrepõem.
// ---------------------------------------------------------------------------
test('C) maybeDeliberate("reflect") single-flight: 2ª chamada concorrente retorna cedo por inFlight', async () => {
  const db = openDb(dbPathFor('c'))
  const holder = holderWithEvents(db)

  // provider com decide PRESO num gate: a reflexão fica pendente até liberarmos.
  let decideCalls = 0
  let releaseDecide!: () => void
  const gate = new Promise<void>((r) => {
    releaseDecide = r
  })
  const slowProvider: LlmProvider = {
    available: async () => true,
    decide: async () => {
      decideCalls++
      await gate
      return { summary: 'lenta', goalUpdates: [] } as never
    },
    chat: async () => '',
    embed: async () => [],
  }

  const deliberator = createDeliberator()

  // 1ª chamada (void): fica presa no gate -> inFlight true.
  const p1 = deliberator.maybeDeliberate(
    deliberator.state,
    holder,
    slowProvider,
    snapshot,
    'reflect',
    Date.now(),
  )
  expect(deliberator.state.inFlight).toBe(true)

  // 2ª chamada concorrente: deve retornar CEDO por inFlight (não chama decide de novo).
  await deliberator.maybeDeliberate(
    deliberator.state,
    holder,
    slowProvider,
    snapshot,
    'reflect',
    Date.now(),
  )
  expect(decideCalls).toBe(1)

  // libera o gate: a 1ª reflexão conclui.
  releaseDecide()
  await p1
  expect(deliberator.state.inFlight).toBe(false)
  expect(decideCalls).toBe(1)

  db.close()
})
