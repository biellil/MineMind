// src/llm/schemas.ts
// LLM-02: schema Zod da decisão de ação com enum de ações FECHADO.
//
// O LLM (modelo local fraco) NUNCA emite uma ação em string livre: ele escolhe
// exclusivamente um valor do enum abaixo. Cada valor mapeia para um estado
// cognitivo da Fase 2 (ver src/cognition/types.ts / arbiter.ts):
//   gather   -> 'gathering'
//   explore  -> 'exploring'
//   navigate -> movimento dirigido (skill navigate)
//   idle     -> 'idle'
//   chat     -> 'socializing' (resposta conversacional)
//
// IMPORTANTE (D-10, Fase 1): o LLM só escolhe AÇÃO + ALVO de alto nível. Os
// parâmetros físicos da skill (coordenadas, range, etc.) são validados DEPOIS
// pelos schemas Zod do toolRegistry (src/skills). O LLM jamais monta a chamada
// física diretamente — isso mantém a superfície de tampering mínima (T-03-01).
import { z } from 'zod'

/** Conjunto FECHADO de ações que o LLM pode escolher (LLM-02). */
export const ActionDecisionSchema = z.object({
  /** Ação de alto nível — enum FECHADO; qualquer valor fora disto é rejeitado por .parse(). */
  action: z.enum(['gather', 'explore', 'navigate', 'idle', 'chat']),
  /** Alvo opcional de alto nível (ex.: tipo de bloco "oak_log", username, coordenada textual). */
  target: z.string().max(64).optional(),
  /** Justificativa curta da decisão (obrigatória — força o modelo a "pensar"). */
  reason: z.string().max(200),
})

/** Decisão de ação validada — o tipo consumido pela cognição. */
export type ActionDecision = z.infer<typeof ActionDecisionSchema>
