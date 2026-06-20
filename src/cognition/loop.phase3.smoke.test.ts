// src/cognition/loop.phase3.smoke.test.ts
// Plano 03-05 / Task 1: smoke headless do loop da Fase 3 (sem servidor MC nem LM Studio).
//
// Espelha o padrao de loop.smoke.test.ts (makeMockBot + driver externo por tick), provando as
// tres propriedades estruturais criticas da Fase 3 SEM nenhuma inferencia real:
//   A) D-17/COG-03: com o LLM OFF (provider.available -> false), o loop NAO trava, resolve um
//      cogState pelo arbiter e a memoria acumula (o agente segue agindo degradado).
//   B) NEED-01/GOAL-01: needs/goals plugados no grafo — survival reflete health/food do snapshot
//      (D-09) e a urgencia que cruza o limiar gera ao menos um goal.
//   C) COG-03/Pitfall 3: o tick reativo NAO bloqueia na deliberacao LLM lenta (single-flight FORA
//      do grafo) — multiplos ticks completam enquanto uma deliberacao de 200ms segue pendente, e
//      uma segunda chamada concorrente de maybeDeliberate NAO dispara (single-flight).
import { test, expect } from 'bun:test'
import { buildGraph } from './graph'
import { createCognitiveStateHolder } from './state'
import { TriggerBus } from './trigger-bus'
import { createDeliberator } from './deliberation'
import { generateGoals } from '../motivation/goals'
import { motivationConfigFor } from '../config'
import type { LlmProvider } from '../llm/provider'
import type { WorldSnapshot } from '../perception/types'

// === Mock de bot (estende o makeMockBot do smoke da Fase 2) ===
// Parametriza health/food para o Teste B (survival baixa -> need degradada -> goal).
// Mundo vazio (sem blocos/jogadores) -> arbitragem autonoma cai em 'exploring'.
function makeMockBot(opts: { health?: number; food?: number } = {}): any {
  const pos = { x: 0, y: 64, z: 0, distanceTo: (_o: any) => 0, offset: (_dx: any, _dy: any, _dz: any) => pos }
  return {
    username: 'MineMind',
    health: opts.health ?? 20,
    food: opts.food ?? 20,
    entity: { position: pos },
    time: { timeOfDay: 1000 }, // dia
    entities: {},
    players: {},
    inventory: { items: () => [] }, // inventario vazio -> resources insatisfeita
    findBlocks: () => [],
    blockAt: () => null,
    blockAtCursor: () => null, // sem bloco na mira -> lookingAt null (enriquecimento de percepcao)
    findBlock: () => null,
    pathfinder: { goto: async () => {} },
    on: () => {},
    once: () => {},
  }
}

// LlmProvider MOCK "LM Studio OFF" — available:false forca o caminho fallback do arbiter (D-17).
// decide/chat nunca devem ser chamados pelo decideAction quando available e false.
const offProvider: LlmProvider = {
  embed: async () => [],
  available: async () => false,
  decide: async () => {
    throw new Error('LLM off — decide nao deveria ser chamado')
  },
  chat: async () => '',
}

const cfg = (thread_id: string) => ({ configurable: { thread_id } })

// ---------------------------------------------------------------------------
// Teste A — D-17: LM Studio OFF -> degrada ao arbiter, loop nao trava, memoria acumula.
// ---------------------------------------------------------------------------
test('A) provider OFF (available:false) -> loop degrada ao arbiter sem travar; memoria acumula (D-17)', async () => {
  const bot = makeMockBot()
  const holder = createCognitiveStateHolder()
  const { graph } = buildGraph({ bot, holder, provider: offProvider, triggerBus: new TriggerBus() })

  let last: any
  // ~10 ticks via driver externo; nenhum deve lancar mesmo com o LLM off.
  for (let i = 0; i < 10; i++) {
    last = await graph.invoke({}, cfg('phase3-off'))
  }

  // o loop resolveu um estado cognitivo (arbiter, nao LLM) e nao lancou
  expect(last).toBeDefined()
  expect(last.snapshot).toBeDefined()
  expect(last.cogState).toBeDefined()
  // Mundo vazio -> arbitragem autonoma cai em 'exploring' e dispara navigate. Com o GROUNDING da
  // Fase 7 (07-03), um navigate que NAO move o bot (mock goto no-op, posicao fixa) e reportado como
  // 'no_effect' (observed:0) em vez de 'success' por nao-throw. Repetidos no_effect alimentam o
  // backoff D-11 (consecutiveFailures -> shouldFallbackToIdle), entao o estado final OSCILA entre
  // 'exploring' (agindo) e 'idle' (backoff). Ambos sao saidas validas do arbiter autonomo — o ponto
  // do teste (D-17: degrada ao arbiter, nao trava, memoria acumula) e provado abaixo.
  expect(['exploring', 'idle']).toContain(last.cogState)

  // a deliberacao nunca rodou (so o grafo) -> nenhuma decisao LLM foi escrita no holder.
  // analyze degradou ao arbiter sem depender de holder.llmDecision (permanece null).
  expect(holder.llmDecision).toBeNull()

  // o agente continuou AGINDO degradado: a memoria acumulou eventos de acao ao longo dos ticks.
  expect(Array.isArray(holder.memory.events)).toBe(true)
  expect(holder.memory.events.length).toBeGreaterThan(0)
}, 60_000)

// ---------------------------------------------------------------------------
// Teste B — NEED-01/GOAL-01: needs/goals plugados no grafo.
// ---------------------------------------------------------------------------
test('B) needs/goals plugados no grafo: survival reflete health/food do snapshot e gera goal (NEED-01/GOAL-01)', async () => {
  // vida/fome baixas (4/20 cada) -> survival = (4/20 + 4/20)/2 = 0.2 (degradada, < critico 0.3)
  const bot = makeMockBot({ health: 4, food: 4 })
  const holder = createCognitiveStateHolder()
  const { graph } = buildGraph({ bot, holder, provider: offProvider, triggerBus: new TriggerBus() })

  for (let i = 0; i < 3; i++) await graph.invoke({}, cfg('phase3-needs'))

  // observe escreveu as needs avaliadas no holder (fonte unica D-09).
  const survival = holder.needs.find((n) => n.kind === 'survival')
  expect(survival).toBeDefined()
  // survival reflete o snapshot de health/food (nao resetada para 1)
  expect(survival!.value).toBeCloseTo(0.2, 5)

  // resources tambem degradada (inventario vazio -> 0 dos resourceTargets presentes).
  const resources = holder.needs.find((n) => n.kind === 'resources')
  expect(resources!.value).toBe(0)

  // GOAL-01: a urgencia que cruza o limiar gera ao menos um goal a partir das needs.
  // Asserimos generateGoals diretamente sobre as needs degradadas do holder (caminho puro do grafo).
  const mcfg = motivationConfigFor(holder.disposition)
  const goals = generateGoals(holder.needs, Date.now(), mcfg)
  expect(goals.length).toBeGreaterThan(0)
  // e o grafo selecionou um currentGoal (observe -> selectGoal escreveu no holder).
  expect(holder.currentGoal).not.toBeNull()
}, 60_000)

// ---------------------------------------------------------------------------
// Teste C — COG-03/Pitfall 3: tick nao bloqueia na deliberacao lenta; single-flight.
// ---------------------------------------------------------------------------
test('C) tick reativo nao bloqueia na deliberacao lenta; segunda chamada concorrente nao dispara (COG-03/single-flight)', async () => {
  const bot = makeMockBot()
  const holder = createCognitiveStateHolder()

  // snapshot minimo para alimentar maybeDeliberate (serializeContext apenas le campos).
  const snapshot: WorldSnapshot = {
    capturedAt: Date.now(),
    status: { health: 20, food: 20, position: { x: 0, y: 64, z: 0 }, timeOfDay: 1000, isDay: true },
    entities: [],
    players: [],
    nearbyBlockTypes: {},
    inventory: [],
    lookingAt: null,
    underfoot: 'unknown',
  }

  // provider "LLM lento": available true, decide demora ate liberarmos manualmente (gate).
  // Isso desacopla a prova de NAO-bloqueio do tempo de parede dos ticks do grafo (anti-flaky).
  let decideCalls = 0
  let releaseDecide!: () => void
  const decideGate = new Promise<void>((r) => {
    releaseDecide = r
  })
  const slowProvider: LlmProvider = {
    embed: async () => [],
    available: async () => true,
    decide: async () => {
      decideCalls++
      await decideGate // so resolve quando o teste liberar (deliberacao fica pendente o tempo todo)
      // retorna uma ActionDecision valida do enum fechado
      return { action: 'idle', reason: 'slow-mock' } as never
    },
    chat: async () => '',
  }

  const deliberator = createDeliberator()
  const { graph } = buildGraph({ bot, holder, provider: slowProvider, triggerBus: new TriggerBus() })
  // 'periodic' sempre dispara (shouldTrigger -> true); o teto de frequencia e controlado abaixo.
  const trigger = 'periodic' as const

  // Dispara a deliberacao LENTA SEM aguardar (void), exatamente como o loop real (Pattern 3).
  const slowPromise = deliberator.maybeDeliberate(
    deliberator.state,
    holder,
    slowProvider,
    snapshot,
    trigger,
    Date.now(),
  )

  // ENQUANTO a deliberacao esta presa no gate (pendente), multiplos ticks do grafo devem COMPLETAR.
  // (se o tick aguardasse a inferencia, isto travaria/serializaria.) O gate garante que a
  // deliberacao NAO resolve antes de nos liberarmos — prova robusta de nao-bloqueio (sem timing).
  expect(deliberator.state.inFlight).toBe(true)
  for (let i = 0; i < 5; i++) {
    const r = await graph.invoke({}, cfg('phase3-nonblock'))
    expect(r.snapshot).toBeDefined()
    // cada tick completou COM a deliberacao lenta ainda pendente (nao bloqueou).
    expect(deliberator.state.inFlight).toBe(true)
  }

  // single-flight: uma SEGUNDA chamada concorrente NAO dispara uma nova inferencia.
  await deliberator.maybeDeliberate(
    deliberator.state,
    holder,
    slowProvider,
    snapshot,
    trigger,
    Date.now(),
  )
  expect(decideCalls).toBe(1) // a 2a chamada retornou cedo por inFlight (nao chamou decide de novo)

  // agora liberamos o gate: a deliberacao lenta conclui e escreve a decisao no holder.
  releaseDecide()
  await slowPromise
  expect(deliberator.state.inFlight).toBe(false)
  expect(decideCalls).toBe(1)
  expect(holder.llmDecision).not.toBeNull()
  expect(holder.llmDecision!.decision.action).toBe('idle')
}, 60_000)
