// src/llm/structured.ts
// LLM-02 / D-17: caminho de decisão estruturada com repair/retry e fallback determinístico.
//
// Garantias (a rede de segurança do loop cognitivo):
//  - Se o LLM está indisponível -> usa o fallback SEM chamar o modelo (D-17).
//  - Se o LLM retorna algo inválido -> tenta UMA vez reparar com um re-prompt curto.
//  - Se o reparo também falha -> usa o fallback.
//  - decideAction NUNCA lança: sempre resolve com uma ActionDecision válida (o loop nunca trava).
//
// O fallback é INJETADO por parâmetro (mantém este módulo puro/testável). O Plan 03 passa
// o arbiter determinístico (src/cognition/arbiter.ts) como fallback.
import { HumanMessage, type BaseMessage } from '@langchain/core/messages'
import { ActionDecisionSchema, type ActionDecision } from './schemas'
import type { LlmProvider } from './provider'

/**
 * Decide a próxima ação via LLM com validação Zod, repair de uma tentativa e fallback.
 *
 * @param provider  cliente LLM abstraído (LlmProvider).
 * @param messages  mensagens de contexto (system persona + contexto serializado).
 * @param fallback  produtor determinístico de ação usado quando o LLM falha/está off (D-17).
 * @param opts      10.1-02/D-12: `signal` de preempção propagado a provider.decide (o player aborta
 *                  a AÇÃO em voo via AbortController do loop). Abortar libera o slot do semáforo no
 *                  finally; a ação re-despacha no próximo tick.
 */
export async function decideAction(
  provider: LlmProvider,
  messages: BaseMessage[],
  fallback: () => ActionDecision,
  opts?: { signal?: AbortSignal },
): Promise<ActionDecision> {
  // D-17: LLM indisponível -> fallback imediato, sem custo de inferência.
  if (!(await provider.available())) return fallback()

  try {
    const raw = await provider.decide(ActionDecisionSchema, messages, opts)
    return ActionDecisionSchema.parse(raw)
  } catch (e1) {
    // Tentativa única de reparo: re-prompt curto citando o erro, exigindo JSON válido.
    try {
      const hint = repairHint(e1)
      const repaired = await provider.decide(ActionDecisionSchema, [...messages, hint], opts)
      return ActionDecisionSchema.parse(repaired)
    } catch {
      // D-17: irreparável -> fallback determinístico (nunca lança para fora).
      return fallback()
    }
  }
}

/**
 * Constrói uma HumanMessage curta instruindo o modelo a responder SOMENTE com JSON que
 * satisfaça o schema (action no enum fechado), citando a mensagem de erro da tentativa anterior.
 */
export function repairHint(err: unknown): BaseMessage {
  const reason = err instanceof Error ? err.message : String(err)
  return new HumanMessage(
    `Sua resposta anterior foi inválida (${reason}). ` +
      `Responda SOMENTE com um objeto JSON válido, sem texto extra, no formato: ` +
      `{"action": <um de: gather|explore|navigate|idle|chat>, "target"?: string, "reason": string}. ` +
      `O campo action DEVE ser exatamente um desses valores.`,
  )
}
