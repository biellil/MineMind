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
import { ReflectionOutputSchema, type ReflectionOutput } from '../llm/schemas'
import { arbitrate } from './arbiter'
import type { CognitiveState, ControlMode } from './types'
import { getEvents } from '../memory/shortTerm'
import { consolidate, applyGoalUpdates } from './reflection'
import { retrieve } from '../memory/longTerm'
import { persistHolder } from '../memory/holder.persistence'
import { config } from '../config'

/** Gatilhos de deliberação (D-19). `reflect` (REFL-01/D-12) reusa o single-flight existente. */
export type DeliberationTrigger = 'chat' | 'goal_changed' | 'need_threshold' | 'periodic' | 'reflect'

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
    case 'reflect':
      // QUANDO refletir é decidido por shouldReflect no loop; aqui o single-flight só evita sobreposição.
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
 *
 * Retorna `true` SOMENTE quando o trabalho de deliberação/reflexão de fato executou; `false`
 * quando faz no-op (inFlight, orçamento de replan, ou shouldTrigger=false). O loop usa esse
 * booleano para só rearmar o gatilho de reflexão quando a reflexão realmente rodou (B1).
 *
 * D-19: o orçamento `replanMinIntervalMs` é o teto de REPLANEJAMENTO DE AÇÃO. A reflexão
 * (`trigger === 'reflect'`) tem cadência própria via shouldReflect no loop (D-10) e NÃO é
 * limitada por esse orçamento — mas continua sob o lock single-flight `inFlight` para nunca
 * sobrepor uma ação (D-12 — o modelo local é fraco; uma inferência por vez).
 */
export async function maybeDeliberate(
  state: DeliberationState,
  holder: CognitiveStateHolder,
  provider: LlmProvider,
  snapshot: WorldSnapshot,
  trigger: DeliberationTrigger,
  now: number,
): Promise<boolean> {
  if (state.inFlight) return false // single-flight (D-02/D-19/D-12) — vale p/ ação E reflexão
  // D-19: o orçamento de replan é APENAS para o caminho de AÇÃO. A reflexão pula este gate
  // (sua cadência é governada por shouldReflect no loop, D-10), evitando que o budget de ação
  // a deixe faminta (B1).
  if (trigger !== 'reflect' && now - state.lastRunAt < config.replanMinIntervalMs) return false
  if (!shouldTrigger(trigger, holder)) return false // event-driven (D-19)

  state.inFlight = true
  try {
    if (trigger === 'reflect') {
      // REFL-01/D-12: ramo de reflexão — reusa o lock single-flight herdado (não sobrepõe ação).
      await runReflection(holder, provider, snapshot, now)
    } else {
      // Caminho de AÇÃO existente. SOC-02/D-14: injeta a personalidade evolutiva no prompt.
      const messages: BaseMessage[] = [
        new SystemMessage(buildPersonaPrompt(holder.disposition, holder.personality)),
        new HumanMessage(
          serializeContext(snapshot, holder.needs, holder.currentGoal, getEvents(holder.memory)),
        ),
      ]
      // D-17: arbiter como fallback determinístico (decideAction nunca lança — Plan 01).
      const fallback = () => arbiterToDecision(snapshot, holder.control.getMode())
      const decision = await decideAction(provider, messages, fallback)
      holder.llmDecision = { decision, at: now }
    }
  } finally {
    state.inFlight = false
    state.lastRunAt = now
  }
  return true // executou o trabalho de deliberação/reflexão (B1)
}

/**
 * Ramo de REFLEXÃO (REFL-01/D-12), executado sob o lock single-flight de maybeDeliberate.
 * NUNCA lança (try/catch interno) — degrada graciosamente para a consolidação determinística.
 *
 * Fluxo:
 *  1. (se LLM disponível) recupera memórias relevantes (D-08) e pede ao LLM um ReflectionOutput
 *     (resumo + deltas de objetivo), restrito por ReflectionOutputSchema;
 *  2. consolida SEMPRE CP→LP (D-13) — com ou sem LLM — gravando UM evento episódico em LP;
 *  3. aplica os deltas de objetivo (fallback no-op se vazio);
 *  4. faz flush da mente ao disco ao fim do ciclo de reflexão (D-02).
 */
export async function runReflection(
  holder: CognitiveStateHolder,
  provider: LlmProvider,
  snapshot: WorldSnapshot,
  now: number,
): Promise<void> {
  const recent = getEvents(holder.memory)
  let summary: string | undefined
  let updates: ReflectionOutput['goalUpdates'] = []

  if (await provider.available()) {
    try {
      // Contexto recuperado (D-08): memórias relevantes ao colorir a reflexão (fallback sem embedding).
      const recalled = holder.db ? retrieve(holder.db, null, now, { limit: 5 }) : []
      const messages: BaseMessage[] = [
        new SystemMessage(buildPersonaPrompt(holder.disposition, holder.personality)),
        new HumanMessage(
          'Reflita sobre os eventos recentes e atualize objetivos.\n' +
            serializeContext(snapshot, holder.needs, holder.currentGoal, recent) +
            (recalled.length
              ? `\nMemórias relevantes:\n${recalled.map((r) => r.summary).join('\n')}`
              : ''),
        ),
      ]
      const out = ReflectionOutputSchema.parse(await provider.decide(ReflectionOutputSchema, messages))
      summary = out.summary
      updates = out.goalUpdates
    } catch (e) {
      console.error(
        '[reflect] LLM inválido — consolidação determinística (no-op em goals):',
        e instanceof Error ? e.message : e,
      )
    }
  }

  // SEMPRE consolida CP→LP (D-13), com ou sem LLM:
  let emb: number[] | null = null
  if (holder.db && summary) {
    try {
      emb = await provider.embed(summary)
    } catch {
      emb = null
    }
  }
  if (holder.db) consolidate(holder.db, recent, now, emb, summary)

  // Atualiza objetivos (fallback no-op se vazio):
  holder.goals = applyGoalUpdates(holder.goals, updates, now)

  // Flush da mente ao fim do ciclo de reflexão (D-02):
  if (holder.db) persistHolder(holder.db, holder, now)
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
  ) => Promise<boolean>
} {
  const state: DeliberationState = { inFlight: false, lastRunAt: -Infinity }
  return { state, maybeDeliberate }
}
