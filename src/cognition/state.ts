// src/cognition/state.ts
// CONN-03 / D-20: estado cognitivo durável FORA-DO-BOT (Pattern 4 / A4).
//
// O CognitiveStateHolder é a FONTE ÚNICA da "mente" do agente: control/safety/memory
// (que antes nasciam por sessão) + os novos needs/goals/disposition/llmDecision. É criado
// UMA vez em bot/index.ts (ANTES de createBot) e injetado em cada startCognitiveLoop(bot, holder).
// Assim a reconexão (nova sessão de bot) REUSA o mesmo holder → a mente não reinicia (Pitfall 2).
//
// ESCOPO (D-20): persistência EM-PROCESSO apenas. NÃO há gravação em disco (sem bun:sqlite,
// sem writeFileSync). O holder é um objeto mutável vivo no processo; quando o processo morre,
// a mente recomeça do zero — a durabilidade através de RECONEXÕES é o objetivo desta fase.
import { config } from '../config'
import type { ControlState } from '../control/commands'
import { createControlState } from '../control/commands'
import type { SafetyState } from './safety'
import { createSafetyState } from './safety'
import type { ShortTermMemory } from '../memory/shortTerm'
import { createMemory } from '../memory/shortTerm'
import type { Disposition, Goal, Need } from '../motivation/types'
import { createNeeds } from '../motivation/needs'
import type { ActionDecision } from '../llm/schemas'

/**
 * A "mente" durável do agente, viva no processo e compartilhada entre sessões de bot.
 *
 * `memory` é uma propriedade REATRIBUÍVEL (`holder.memory = ...`): o holder é a fonte única
 * (Pattern 4/A4), então os nós do grafo escrevem de volta nele. NÃO há persistência em disco.
 */
export interface CognitiveStateHolder {
  control: ControlState
  safety: SafetyState
  memory: ShortTermMemory
  needs: Need[]
  goals: Goal[]
  currentGoal: Goal | null
  disposition: Disposition
  /**
   * Sinal de pedido de jogador pendente — consumido por selectGoal (Plan 02 via
   * SelectGoalContext) e derivado no observe (Plan 03). Declarado AQUI com default `false`
   * para fechar o contrato/tsc: o Plan 04 apenas SETA o valor (caminho conversacional),
   * nunca estende a estrutura.
   */
  playerRequestPending: boolean
  /** Última decisão LLM escrita pela deliberação (com timestamp p/ checagem de frescor). */
  llmDecision: { decision: ActionDecision; at: number } | null
}

/**
 * Cria o holder único da mente. Chamar 1x em bot/index.ts antes de createBot.
 * needs inicializa com as 5 kinds (createNeeds, Plan 02); disposition vem da config.
 */
export function createCognitiveStateHolder(now: number = Date.now()): CognitiveStateHolder {
  return {
    control: createControlState('autonomous'),
    safety: createSafetyState(),
    memory: createMemory(config.memoryTokenBudget),
    needs: createNeeds(now),
    goals: [],
    currentGoal: null,
    disposition: config.dispositionDefault,
    playerRequestPending: false,
    llmDecision: null,
  }
}
