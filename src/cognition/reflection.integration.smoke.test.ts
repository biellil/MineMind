// src/cognition/reflection.integration.smoke.test.ts
// REFL-01 / Plan 04-07 Task 2: smoke headless do WIRING da reflexão (sem servidor MC nem LM Studio).
//
// Prova as três propriedades estruturais do ramo de reflexão da deliberação single-flight:
//   A) com um provider FAKE (available:true + decide -> ReflectionOutput válido), runReflection
//      consolida CP→LP (UM evento episódico em `events`) e faz flush da mente (kv['holder']).
//   B) com provider OFF (available:false), runReflection AINDA consolida deterministicamente
//      (sem lançar) e os goals ficam inalterados (fallback no-op).
//   C) gate por tipo: duas chamadas concorrentes de maybeDeliberate('reflect') NÃO rodam duas
//      reflexões simultâneas (a 2ª retorna cedo pelo gate 'reflection' — 10.1-02 substitui o inFlight).
import { test, expect, afterAll } from 'bun:test'
import { unlinkSync, existsSync, readdirSync } from 'node:fs'
import { openDb, kvGet } from '../memory/persistence'
import { push } from '../memory/shortTerm'
import { createCognitiveStateHolder } from './state'
import { createDeliberator, runReflection } from './deliberation'
import { Semaphore, createTaskGate } from './concurrency'
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
  lookingAt: null,
  underfoot: 'unknown',
}

function actionEvent(target: string, ts: number): MemEvent {
  return { type: 'action', skill: 'gather', target, outcome: 'success', observed: 1, expected: 1, result: 'success', timestamp: ts }
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
    maxConcurrency: 1,
    available: async () => true,
    decide: async () => ({ summary: 'Refleti sobre coleta e dano.', goalUpdates: [] }) as never,
    chat: async () => '',
    embed: async () => [],
  }
}

const offProvider: LlmProvider = {
  maxConcurrency: 1,
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
test('C) maybeDeliberate("reflect") gate por tipo: 2ª chamada concorrente retorna cedo (gate reflection)', async () => {
  const db = openDb(dbPathFor('c'))
  const holder = holderWithEvents(db)

  // provider com decide PRESO numa promise: a reflexão fica pendente até liberarmos.
  let decideCalls = 0
  let releaseDecide!: () => void
  const decideHold = new Promise<void>((r) => {
    releaseDecide = r
  })
  const slowProvider: LlmProvider = {
    maxConcurrency: 1,
    available: async () => true,
    decide: async () => {
      decideCalls++
      await decideHold
      return { summary: 'lenta', goalUpdates: [] } as never
    },
    chat: async () => '',
    embed: async () => [],
  }

  const deliberator = createDeliberator()
  // 10.1-02: gate por tipo + semáforo externos (substituem o inFlight). gate 'reflection' busy =
  // reflexão em voo.
  const taskGate = createTaskGate()
  const semaphore = new Semaphore(1)

  // 1ª chamada (void): fica presa no decideHold -> gate 'reflection' busy.
  const p1 = deliberator.maybeDeliberate(
    deliberator.state, holder, slowProvider, snapshot, 'reflect', Date.now(), null, taskGate, semaphore,
  )
  expect(taskGate.isBusy('reflection')).toBe(true)

  // 2ª chamada concorrente DO MESMO TIPO: retorna CEDO pelo gate 'reflection' (não chama decide de novo).
  await deliberator.maybeDeliberate(
    deliberator.state, holder, slowProvider, snapshot, 'reflect', Date.now(), null, taskGate, semaphore,
  )
  // Plan 04: runReflection ganhou um await extra (retrieve agora é async — KNN no Chroma) ANTES de
  // decide; drena microtasks para que a 1ª reflexão alcance provider.decide antes do assert.
  for (let i = 0; i < 5; i++) await Promise.resolve()
  expect(decideCalls).toBe(1)

  // libera: a 1ª reflexão conclui.
  releaseDecide()
  await p1
  expect(taskGate.isBusy('reflection')).toBe(false)
  expect(decideCalls).toBe(1)

  db.close()
})

// ===========================================================================
// REGRESSÃO B1 + 10.1-02 — contenção ação×reflexão no loop vivo. Sob o novo modelo
// (gate por tipo + semáforo, substituindo o inFlight único), ação e reflexão NÃO se
// excluem mais por tipo (Pitfall 6); o semáforo (permits) é quem decide se coexistem
// ou serializam. Estes testes provam:
//   D) maybeDeliberate retorna false no no-op (gate do tipo ocupado / budget de ação) e true quando roda.
//   E) reflect NÃO é gated pelo orçamento de replan de AÇÃO (não fica faminta).
//   F) ação e reflexão usam gates de tipo INDEPENDENTES (deixa de ser XOR — Pitfall 6); com
//      semáforo permits=1 a 2ª tarefa serializa (aguarda o slot) em vez de no-op.
// ===========================================================================

// snapshot mínimo para o caminho de AÇÃO (decideAction lê via serializeContext).
const actionSnapshot: WorldSnapshot = { ...snapshot }

// provider de AÇÃO: available true; decide devolve uma ActionDecision válida (idle).
function fakeActionProvider(): LlmProvider {
  return {
    maxConcurrency: 1,
    available: async () => true,
    decide: async () => ({ action: 'idle', reason: 'teste' }) as never,
    chat: async () => '',
    embed: async () => [],
  }
}

// ---------------------------------------------------------------------------
// D) contrato booleano: true quando roda; false no no-op (gate do tipo ocupado / budget de ação).
// ---------------------------------------------------------------------------
test('D) maybeDeliberate retorna true quando executa e false no no-op (gate do tipo / budget de ação)', async () => {
  const db = openDb(dbPathFor('d'))
  const holder = holderWithEvents(db)
  const deliberator = createDeliberator()
  const gate = createTaskGate()
  const semaphore = new Semaphore(1)
  const t0 = 100_000

  // 1) Uma AÇÃO roda (estado fresco, dentro do trigger) -> true e consome lastRunAt.
  const ranAction = await deliberator.maybeDeliberate(
    deliberator.state, holder, fakeActionProvider(), actionSnapshot, 'periodic', t0, null, gate, semaphore,
  )
  expect(ranAction).toBe(true)
  expect(deliberator.state.lastRunAt).toBe(t0)

  // 2) Uma 2ª AÇÃO imediata (mesmo instante) cai no orçamento de replan -> no-op -> false.
  const ranAction2 = await deliberator.maybeDeliberate(
    deliberator.state, holder, fakeActionProvider(), actionSnapshot, 'periodic', t0, null, gate, semaphore,
  )
  expect(ranAction2).toBe(false)

  // 3) Com o gate 'reflection' já ocupado, uma chamada de REFLECT faz no-op -> false (não sobrepõe o tipo).
  // Bem além do budget — prova que o false veio do GATE do tipo, não do orçamento de ação.
  gate.tryEnter('reflection')
  const ranWhileBusy = await deliberator.maybeDeliberate(
    deliberator.state, holder, fakeActionProvider(), actionSnapshot, 'reflect', t0 + 1_000_000, null, gate, semaphore,
  )
  expect(ranWhileBusy).toBe(false)
  gate.leave('reflection')

  db.close()
})

// ---------------------------------------------------------------------------
// E) ANTI-STARVATION: logo após uma AÇÃO consumir lastRunAt, um reflect com
//    inFlight=false AINDA roda (não é gated pelo replanMinIntervalMs de ação).
// ---------------------------------------------------------------------------
test('E) reflect NÃO é gated pelo budget de ação: roda mesmo logo após uma ação (B1)', async () => {
  const db = openDb(dbPathFor('e'))
  const holder = holderWithEvents(db)
  const deliberator = createDeliberator()
  const t0 = 200_000

  // AÇÃO roda e consome o orçamento (lastRunAt = t0).
  const ranAction = await deliberator.maybeDeliberate(
    deliberator.state,
    holder,
    fakeActionProvider(),
    actionSnapshot,
    'periodic',
    t0,
  )
  expect(ranAction).toBe(true)
  expect(deliberator.state.lastRunAt).toBe(t0)

  // REFLECT imediato (mesmo instante, DENTRO da janela replanMinIntervalMs de ação):
  // antes do fix retornaria por budget; agora deve RODAR.
  const ranReflect = await deliberator.maybeDeliberate(
    deliberator.state,
    holder,
    fakeOnProvider(),
    actionSnapshot,
    'reflect',
    t0, // = lastRunAt: zero ms desde a ação -> dentro do budget de replan
  )
  expect(ranReflect).toBe(true)

  // E produziu um evento consolidado type='reflection' (reflexão não está faminta).
  const refl = db.prepare(`SELECT COUNT(*) AS n FROM events WHERE type = 'reflection'`).get() as {
    n: number
  }
  expect(refl.n).toBe(1)

  db.close()
})

// ---------------------------------------------------------------------------
// F) 10.1-02 (Pitfall 6): ação e reflexão usam gates de tipo INDEPENDENTES — a reflexão NÃO é mais
//    bloqueada por uma ação em voo (deixa de ser XOR). Mas com o semáforo permits=1, a 2ª tarefa
//    SERIALIZA (aguarda o slot da 1ª) em vez de fazer no-op. Quando a ação libera o slot, a reflexão
//    adquire e roda — coordenação por RECURSO (semáforo), não por exclusão de tipo.
// ---------------------------------------------------------------------------
test('F) ação e reflexão coexistem por tipo (Pitfall 6); semáforo permits=1 serializa o slot', async () => {
  const db = openDb(dbPathFor('f'))
  const holder = holderWithEvents(db)
  const deliberator = createDeliberator()
  const gate = createTaskGate()
  const semaphore = new Semaphore(1) // permits=1 → serialização (D-03)

  // provider de AÇÃO preso num gate de teste: a ação segura o ÚNICO permit até liberarmos.
  let actionDecideCalls = 0
  let releaseAction!: () => void
  const actionGate = new Promise<void>((r) => {
    releaseAction = r
  })
  const slowActionProvider: LlmProvider = {
    maxConcurrency: 1,
    available: async () => true,
    decide: async () => {
      actionDecideCalls++
      await actionGate
      return { action: 'idle', reason: 'lenta' } as never
    },
    chat: async () => '',
    embed: async () => [],
  }

  // reflect provider que conta quando é chamado (só DEPOIS que a ação liberar o permit).
  let reflectDecideCalls = 0
  const reflectProvider: LlmProvider = {
    maxConcurrency: 1,
    available: async () => true,
    decide: async () => {
      reflectDecideCalls++
      return { summary: 'reflexão válida', goalUpdates: [] } as never
    },
    chat: async () => '',
    embed: async () => [],
  }

  // 1) AÇÃO (void): adquire o permit e fica presa no gate de teste -> gate 'action' busy.
  const pAction = deliberator.maybeDeliberate(
    deliberator.state, holder, slowActionProvider, actionSnapshot, 'periodic', Date.now(), null, gate, semaphore,
  )
  // drena microtasks p/ a ação adquirir o permit e chegar a provider.decide.
  for (let i = 0; i < 6; i++) await Promise.resolve()
  expect(gate.isBusy('action')).toBe(true)
  expect(actionDecideCalls).toBe(1)

  // 2) REFLECT concorrente: passa pelo gate 'reflection' (TIPO INDEPENDENTE — não bloqueia), mas
  // PENDURA no semáforo (permit esgotado pela ação). NÃO faz no-op; aguarda o slot.
  const pReflect = deliberator.maybeDeliberate(
    deliberator.state, holder, reflectProvider, actionSnapshot, 'reflect', Date.now(), null, gate, semaphore,
  )
  for (let i = 0; i < 4; i++) await Promise.resolve()
  expect(gate.isBusy('reflection')).toBe(true) // a reflexão ENTROU no gate (tipo independente)
  expect(reflectDecideCalls).toBe(0) // mas ainda não rodou — pendurada no semáforo (serialização)

  // libera a ação → solta o permit → a reflexão adquire e roda.
  releaseAction()
  expect(await pAction).toBe(true)
  expect(await pReflect).toBe(true)
  expect(reflectDecideCalls).toBe(1) // a reflexão rodou DEPOIS, ao adquirir o slot liberado
  expect(gate.isBusy('action')).toBe(false)
  expect(gate.isBusy('reflection')).toBe(false)

  db.close()
})
