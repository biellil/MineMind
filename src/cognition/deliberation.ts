// src/cognition/deliberation.ts
// COG-03 / D-19: deliberação LLM single-flight, event-driven, FORA do grafo (Pattern 3).
//
// A camada reativa (grafo da Fase 2) roda no tick rápido e NUNCA espera o LLM. Esta deliberação
// "lenta" roda em paralelo: quando dispara, chama decideAction (Plan 01) com o arbiter como
// fallback (D-17) e escreve a decisão no holder. O nó analyze/decide lê a decisão PRONTA.
//
// Garantias (Pitfall 3 / T-03-09):
//  - single-flight: nunca há duas inferências concorrentes (inFlight).
//  - orçamento de replanejamento: respeita config.replanMinIntervalMs entre disparos (D-19).
//  - event-driven: só dispara em eventos relevantes (shouldTrigger).
//  - ISTO NÃO É UM NÓ DO GRAFO — a inferência lenta jamais entra no tick rápido.
import { SystemMessage, HumanMessage, type BaseMessage } from '@langchain/core/messages'
import type { WorldSnapshot } from '../perception/types'
import type { CognitiveStateHolder } from './state'
import type { LlmProvider } from '../llm/provider'
import { decideAction } from '../llm/structured'
import { buildPersonaPrompt, serializeContext } from '../llm/prompts'
import type { ActionDecision } from '../llm/schemas'
import { arbitrate } from './arbiter'
import type { CognitiveState, ControlMode } from './types'
import { getEvents } from '../memory/shortTerm'
import { config } from '../config'

/** Gatilhos de deliberação (D-19). */
export type DeliberationTrigger = 'chat' | 'goal_changed' | 'need_threshold' | 'periodic'

/** Estado single-flight da deliberação (vive no closure do deliberator — testável/sem global). */
export interface DeliberationState {
  inFlight: boolean
  lastRunAt: number
}

/**
 * Decide se o gatilho deve disparar uma deliberação (event-driven, D-19):
 *  - chat: só em ASSISTANT (em AUTONOMOUS a conversa é mínima, D-07).
 *  - goal_changed / need_threshold: sempre relevantes.
 *  - periodic: rede de segurança (true), mas o teto de frequência (replanMinIntervalMs)
 *    é quem limita de fato no maybeDeliberate.
 */
export function shouldTrigger(trigger: DeliberationTrigger, holder: CognitiveStateHolder): boolean {
  switch (trigger) {
    case 'chat':
      return holder.disposition === 'ASSISTANT'
    case 'goal_changed':
    case 'need_threshold':
    case 'periodic':
      return true
    default:
      return false
  }
}

/** Mapeia o CognitiveState do arbiter para uma ActionDecision do enum FECHADO. */
function cognitiveStateToAction(state: CognitiveState): ActionDecision['action'] {
  switch (state) {
    case 'gathering':
      return 'gather'
    case 'exploring':
      return 'explore'
    case 'socializing':
      return 'chat'
    case 'idle':
    case 'fighting': // stub → idle
    case 'building': // stub → idle
    default:
      return 'idle'
  }
}

/**
 * Materializa "o arbiter é o piso" (D-17): roda o arbiter determinístico e converte o
 * estado resultante numa ActionDecision do enum fechado, com reason marcando a origem.
 */
export function arbiterToDecision(snapshot: WorldSnapshot, mode: ControlMode): ActionDecision {
  const state = arbitrate(snapshot, mode, new Set())
  return { action: cognitiveStateToAction(state), reason: 'fallback:arbiter' }
}

/**
 * Tenta deliberar (single-flight + orçamento de replan + event-driven). NÃO bloqueia o tick:
 * o chamador dispara com `void` e segue para o próximo tick (Pattern 3/Pitfall 3).
 */
export async function maybeDeliberate(
  state: DeliberationState,
  holder: CognitiveStateHolder,
  provider: LlmProvider,
  snapshot: WorldSnapshot,
  trigger: DeliberationTrigger,
  now: number,
): Promise<void> {
  if (state.inFlight) return // single-flight (D-02/D-19)
  if (now - state.lastRunAt < config.replanMinIntervalMs) return // orçamento de replan (D-19)
  if (!shouldTrigger(trigger, holder)) return // event-driven (D-19)

  state.inFlight = true
  try {
    const messages: BaseMessage[] = [
      new SystemMessage(buildPersonaPrompt(holder.disposition)),
      new HumanMessage(
        serializeContext(snapshot, holder.needs, holder.currentGoal, getEvents(holder.memory)),
      ),
    ]
    // D-17: arbiter como fallback determinístico (decideAction nunca lança — Plan 01).
    const fallback = () => arbiterToDecision(snapshot, holder.control.getMode())
    const decision = await decideAction(provider, messages, fallback)
    holder.llmDecision = { decision, at: now }
  } finally {
    state.inFlight = false
    state.lastRunAt = now
  }
}

/**
 * Cria um deliberator com estado single-flight encapsulado no closure (testável, sem global).
 * Uma instância por sessão de loop é suficiente.
 */
export function createDeliberator(): {
  state: DeliberationState
  maybeDeliberate: (
    state: DeliberationState,
    holder: CognitiveStateHolder,
    provider: LlmProvider,
    snapshot: WorldSnapshot,
    trigger: DeliberationTrigger,
    now: number,
  ) => Promise<void>
} {
  const state: DeliberationState = { inFlight: false, lastRunAt: -Infinity }
  return { state, maybeDeliberate }
}
