// src/cognition/graph.ts
// D-01: StateGraph finito por tick (Observe->Analyze->UpdateMemory->Decide->Execute->END).
// D-03: MemorySaver (em memoria, Bun-safe, sem better-sqlite3). A "aresta de retorno" e o driver externo (loop.ts).
// Fase 3 (CONN-03/D-20): o holder (state.ts) e a FONTE UNICA; os campos anotados sao semeados
// do holder no observe e escritos de volta no execute/analyze. needs/goals/disposition entram no estado.
// Fase 07.1 Plan 03: enteredIdle/nextWakeMs — sinais do grafo para o driver event-driven (loop.ts).
import { StateGraph, Annotation, START, END, MemorySaver } from '@langchain/langgraph'
import type { WorldSnapshot } from '../perception/types'
import type { CognitiveState } from './types'
import type { Disposition, Goal, Need } from '../motivation/types'
import { type ShortTermMemory, createMemory } from '../memory/shortTerm'
import { config } from '../config'
import { createNodes, type NodeDeps } from './nodes'

const LoopAnnotation = Annotation.Root({
  snapshot: Annotation<WorldSnapshot | null>({ reducer: (_p, u) => u, default: () => null }),
  cogState: Annotation<CognitiveState>({ reducer: (_p, u) => u, default: () => 'idle' }),
  memory: Annotation<ShortTermMemory>({ reducer: (_p, u) => u, default: () => createMemory(config.memoryTokenBudget) }),
  needs: Annotation<Need[]>({ reducer: (_p, u) => u, default: () => [] }),
  goals: Annotation<Goal[]>({ reducer: (_p, u) => u, default: () => [] }),
  currentGoal: Annotation<Goal | null>({ reducer: (_p, u) => u, default: () => null }),
  disposition: Annotation<Disposition>({ reducer: (_p, u) => u, default: () => config.dispositionDefault }),
  // Fase 07.1 Plan 03: sinais para o driver event-driven (D-10/D-11).
  // enteredIdle: true quando observe detecta que não há objetivo ativo (sem skill = idle genuíno).
  // nextWakeMs: quanto tempo o park deve esperar no máximo antes de acordar por timeout-piso.
  enteredIdle: Annotation<boolean>({ reducer: (_p, u) => u, default: () => false }),
  nextWakeMs: Annotation<number>({ reducer: (_p, u) => u, default: () => config.navigateTimeoutMs }),
})

/**
 * Compila um grafo finito-por-tick com bot/holder/provider/triggerBus injetados por closure.
 * Retorna { graph, checkpointer }: o checkpointer (MemorySaver in-memory) é exposto para que o
 * driver (loop.ts) possa podá-lo periodicamente via deleteThread (CR#3) — com thread_id fixo,
 * o MemorySaver acumula 1 checkpoint por super-step e a RAM cresce sem limite ao longo da sessão.
 * Fase 07.1 Plan 03: deps agora inclui triggerBus — repassado aos nós para emit('actionFinished').
 */
export function buildGraph(deps: NodeDeps) {
  const n = createNodes(deps)
  const checkpointer = new MemorySaver()
  const graph = new StateGraph(LoopAnnotation)
    .addNode('observe', n.observe)
    .addNode('analyze', n.analyze)
    .addNode('updateMemory', n.updateMemory)
    .addNode('decide', n.decide)
    .addNode('execute', n.execute)
    .addEdge(START, 'observe')
    .addEdge('observe', 'analyze')
    .addEdge('analyze', 'updateMemory')
    .addEdge('updateMemory', 'decide')
    .addEdge('decide', 'execute')
    .addEdge('execute', END) // FINITO: driver externo (loop.ts) fecha o ciclo (D-01)
    .compile({ checkpointer })
  return { graph, checkpointer }
}
