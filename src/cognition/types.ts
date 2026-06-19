// src/cognition/types.ts
// Contratos compartilhados da camada cognitiva (Fase 2). Sem LLM.
import type { SkillOutcome } from '../grounding/types'

/** Estados cognitivos (COG-02 / D-06). Fighting e Building são stub. */
export type CognitiveState =
  | 'idle'
  | 'exploring'
  | 'gathering'
  | 'socializing'
  | 'reflecting' // D-11: trabalho de "tempo livre", prioridade baixa, sempre preemptível (REFL-01)
  | 'fighting'   // stub (D-06)
  | 'building'   // stub (D-06)

/** Modos de controle por comando de chat (D-08). Autônomo é o padrão. */
export type ControlMode = 'autonomous' | 'paused' | 'standby'

/** Eventos ricos gravados na memória de curto prazo (D-12). Discriminados por `type`. */
export type MemEvent =
  | { type: 'state_transition'; from: CognitiveState; to: CognitiveState; timestamp: number }
  | {
      type: 'action'
      skill: string
      target: string
      outcome: SkillOutcome // fonte de verdade (D-06) — deriva do delta observado, não da Promise
      observed: number // quantidade REAL observada
      expected: number // quantidade esperada
      result: 'success' | 'failure' // DERIVADO de outcome (compat consumidores existentes)
      reason?: string
      timestamp: number
    }
  | { type: 'world'; event: 'damage' | 'hunger' | 'player_joined' | 'player_left'; detail: string; timestamp: number }
  | { type: 'chat_command'; command: string; from: string; mode: ControlMode; timestamp: number }
