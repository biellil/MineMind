// src/chat/conversation.ts
// CHAT-01/02 + D-07/D-12/D-13: caminho CONVERSACIONAL do agente, ISOLADO do parser
// literal de controle/disposição (Pattern 5 / Pitfall 6). Esta é a ÚNICA conversa com LLM.
//
// Fluxo (chamado pelo handler do loop SÓ se shouldRespond === true):
//   1. monta [system(persona), human(username: message)]
//   2. provider.chat(...) dentro de try/catch — NUNCA propaga (degrada para silêncio/log).
//   3. responde curto via bot.chat (D-01: resposta concisa, truncada).
//   4. em ASSISTANT, se a mensagem casa um pedido de tipo SUPORTADO (conjunto FECHADO),
//      sinaliza geração de objetivo dinâmico (holder.playerRequestPending + goal candidato).
//
// SEGURANÇA (T-03-13/T-03-14): o LLM de conversa é texto->texto (bot.chat); não dirige ação.
// A AÇÃO só vem da deliberação com enum fechado + Zod + fallback (Plan 01/03). O objetivo
// extraível é restrito a SUPPORTED_REQUEST_KINDS — pedido fora do conjunto NUNCA vira objetivo.
import type { Bot } from 'mineflayer'
import { SystemMessage, HumanMessage } from '@langchain/core/messages'
import type { LlmProvider } from '../llm/provider'
import { buildPersonaPrompt } from '../llm/prompts'
import type { Disposition } from '../motivation/types'
import type { CognitiveStateHolder } from '../cognition/state'
import type { Goal } from '../motivation/types'
import { upsertPlayer, applyTrustEvent, getProfile } from '../social/profiles'
import { reconcileQuantities } from './postFilter'
import { config } from '../config'

/** Comprimento máximo de uma resposta de chat (D-01: respostas curtas). */
const MAX_REPLY_LEN = 256

/**
 * Conjunto FECHADO de tipos de pedido extraíveis de um jogador (Open Question 3 / D-13).
 * Pedido fora deste conjunto recebe resposta conversacional educada, NUNCA um objetivo inválido.
 */
export const SUPPORTED_REQUEST_KINDS = ['gather', 'follow', 'navigate', 'build'] as const
export type SupportedRequestKind = (typeof SUPPORTED_REQUEST_KINDS)[number]

/**
 * Heurística literal simples por palavras-chave (pt/en) para detectar a INTENÇÃO de um pedido.
 * Mapeia a um tipo do conjunto fechado, ou null se nenhum casar. Sem LLM, sem eval — só lookup.
 *
 * Exportada (Fase 12 Plan 03): conversation.test.ts importa e chama diretamente. A ordem importa —
 * gather/follow/navigate ANTES de build (comportamento existente preservado); 'build' é o último
 * casamento (mais específico para "construir/abrigo/parede/torre").
 */
export function detectRequestKind(message: string): SupportedRequestKind | null {
  const m = message.toLowerCase()
  if (/\b(coletar|coleta|colete|minerar|pegar|gather|collect|mine)\b/.test(m)) return 'gather'
  if (/\b(vem|venha|segue|seguir|me\s+segue|follow|come)\b/.test(m)) return 'follow'
  if (/\b(vai|leva|leve|ir\s+para|navegar|navigate|go\s+to|goto)\b/.test(m)) return 'navigate'
  if (/\b(constr[uoói]\w*|build|abrigo|parede|muro|torre|estação|estacao|shelter|wall|tower|station)\b/.test(m)) return 'build'
  return null
}

/**
 * Fase 12 Plan 03: resolve o SUB-tipo de building a partir da mensagem (pt/en). O id do goal
 * precisa começar com `build:` para ser roteável por buildGoalToSkillParams (Plan 02). Default
 * seguro = 'shelter' (abrigo) quando o sub-tipo é ambíguo.
 */
function detectBuildSub(message: string): 'shelter' | 'wall' | 'tower' | 'station' {
  const m = message.toLowerCase()
  if (/\b(abrigo|shelter|casa)\b/.test(m)) return 'shelter'
  if (/\b(parede|muro|wall)\b/.test(m)) return 'wall'
  if (/\b(torre|tower)\b/.test(m)) return 'tower'
  if (/\b(estação|estacao|station|bancada|fornalha)\b/.test(m)) return 'station'
  return 'shelter' // default seguro: abrigo
}

/**
 * Decide se o agente deve responder a uma mensagem de jogador.
 * - Ignora a própria mensagem do bot (username === botUsername) — guard de auto-mensagem (Pitfall 5).
 * - Caso contrário, responde a qualquer jogador próximo em AMBOS os modos (AUTONOMOUS e ASSISTANT).
 *
 * Reverte D-07: AUTONOMOUS agora também responde — comportamento de chat uniforme entre os dois
 * modos (a IA conversa enquanto continua executando seu objetivo). O guard de auto-mensagem
 * (Pitfall 5) permanece. `_proactivity` segue não-usado (prefixo `_`); a assinatura é preservada.
 */
export function shouldRespond(
  disposition: Disposition,
  _proactivity: 'reactive' | 'proactive',
  username: string,
  botUsername: string,
): boolean {
  if (username === botUsername) return false // Pitfall 5: nunca responde a si mesmo
  return true // reverte D-07: responde em AUTONOMOUS e ASSISTANT (chat uniforme)
}

/**
 * Cria um Goal candidato source:'player_request' (priority alta, progress 0).
 *
 * Fase 12 Plan 03: para kind 'build', o id segue o prefixo ROTEÁVEL `build:<sub>` que o
 * buildGoalToSkillParams (Plan 02) consome — o sub-tipo é derivado da mensagem (detectBuildSub).
 * Os demais kinds mantêm o id histórico `player_request:<kind>:<now>`.
 */
function makePlayerRequestGoal(kind: SupportedRequestKind, now: number, message: string): Goal {
  const id = kind === 'build'
    ? `build:${detectBuildSub(message)}` // roteável por buildGoalToSkillParams (Plan 02)
    : `player_request:${kind}:${now}`
  return {
    id,
    kind,
    priority: 1, // pedido de jogador em ASSISTANT preempta (D-13/D-15b) — prioridade alta
    progress: 0,
    dependsOn: [],
    source: 'player_request',
    committedAt: now,
  }
}

/**
 * Trata UMA mensagem de jogador pelo caminho conversacional (CHAT-02). NUNCA lança.
 *
 * @param provider LlmProvider (provider.chat — texto livre com persona).
 * @param holder   mente durável: lê disposition, SETA playerRequestPending/goals quando aplicável.
 * @param bot      bot da sessão (bot.chat para responder no jogo).
 * @param username autor da mensagem.
 * @param message  texto bruto do jogador (entrada NÃO confiável — usado só como contexto do LLM).
 * @param now      timestamp (ms) — injetado para testabilidade.
 */
export async function handleConversation(
  provider: LlmProvider,
  holder: CognitiveStateHolder,
  bot: Bot,
  username: string,
  message: string,
  now: number,
): Promise<void> {
  // (0) registra a interação social (D-15/D-16): upsert do perfil + delta de trust de frequência.
  // Só quando há DB durável (testes com db=null pulam — degradação graciosa).
  if (holder.db) {
    upsertPlayer(holder.db, username, now)
    applyTrustEvent(holder.db, username, 'interaction') // +0.01 frequência
  }

  // Lê o perfil para colorir o prompt por interlocutor (D-17) e aplicar o gate de trust.
  const prof = holder.db ? getProfile(holder.db, username) : undefined

  // (1) monta o prompt: persona + personalidade (SOC-02/D-14) + a mensagem do jogador.
  const messages = [
    new SystemMessage(buildPersonaPrompt(holder.disposition, holder.personality)),
    new HumanMessage(`${username}: ${message}`),
  ]

  // Colore o prompt por interlocutor (D-17): trust baixo => cautela explícita.
  if (prof && prof.trust < 0) {
    messages.splice(
      1,
      0,
      new SystemMessage(`Sobre ${username}: confiança baixa — seja cauteloso e mantenha distância.`),
    )
  }

  // (2) chama o LLM de conversa — degrada gracioso se falhar (D-17): log e segue sem responder.
  let reply: string
  try {
    reply = await provider.chat(messages)
  } catch (err) {
    console.error('[chat] provider.chat falhou:', err instanceof Error ? err.message : err)
    return
  }

  // (3) responde no jogo — curto (D-01). Reply vazia/branca => silêncio.
  // Antes do bot.chat (ÚNICO ponto de saída de fala), o post-filter determinístico (D-09 C/D-10)
  // reconcilia afirmações de quantidade de coleta contra o último delta observado: "peguei 10
  // tábuas" com observed:3 é reescrito para "peguei 3 tábuas". A sozinha (prompt autoritativo)
  // é instrução, não gate — C é a rede determinística que fecha o drift do LLM local (D-11).
  const trimmed = reply.trim()
  if (trimmed.length > 0) {
    const fact = holder.lastObservedDelta
      ? {
          skill: holder.lastObservedDelta.skill,
          observed: holder.lastObservedDelta.observed,
          outcome: holder.lastObservedDelta.outcome,
          delta: holder.lastObservedDelta.delta,
        }
      : null
    const grounded = reconcileQuantities(trimmed, fact)
    bot.chat(grounded.slice(0, MAX_REPLY_LEN))
  }

  // (4) em ASSISTANT, pedido de tipo SUPORTADO vira sinal de objetivo dinâmico (D-13/OQ3),
  // SOMENTE se o trust do interlocutor atinge o limiar (D-17). Em AUTONOMOUS, pedidos NUNCA
  // viram objetivo. Fora do conjunto fechado, ou com trust insuficiente => sem objetivo
  // (a resposta conversacional já cobriu o "não consigo isso ainda" via persona).
  if (holder.disposition === 'ASSISTANT') {
    const kind = detectRequestKind(message)
    const trust = prof?.trust ?? 0
    if (kind !== null && trust >= config.trustRequestThreshold) {
      holder.playerRequestPending = true // o reset é feito pelo observe após selectGoal consumir
      holder.goals.push(makePlayerRequestGoal(kind, now, message))
    }
  }
}
