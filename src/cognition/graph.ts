// src/cognition/graph.ts
// D-01: StateGraph finito por tick (Observe->Analyze->UpdateMemory->Decide->Execute->END).
// D-03: MemorySaver (em memoria, Bun-safe, sem better-sqlite3). A "aresta de retorno" e o driver externo (loop.ts).
// Fase 3 (CONN-03/D-20): o holder (state.ts) e a FONTE UNICA; os campos anotados sao semeados
// do holder no observe e escritos de volta no execute/analyze. needs/goals/disposition entram no estado.
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
})

/** Compila um grafo finito-por-tick com bot/holder/provider injetados por closure. */
export function buildGraph(deps: NodeDeps) {
  const n = createNodes(deps)
  return new StateGraph(LoopAnnotation)
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
    .compile({ checkpointer: new MemorySaver() })
}
