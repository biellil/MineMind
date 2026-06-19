// src/chat/postFilter.ts
// Fase 7 D-09 C / D-10 — gate determinístico final: reconcilia QUANTIDADE de coleta da fala
// do LLM contra o observedDelta real e REESCREVE para o número grounded. Escopo MÍNIMO
// (padrão "peguei/coletei N <item>") — NÃO um validador semântico geral de NLG (deferido).
import type { SkillOutcome } from '../grounding/types'

/**
 * Fato autoritativo (subconjunto de holder.lastObservedDelta) que o post-filter reconcilia.
 * `observed` é a fonte da verdade (D-06); para `no_effect`, observed é 0.
 */
export interface ObservedDeltaFact {
  skill: string
  observed: number
  outcome: SkillOutcome
  delta: Record<string, number>
}

/** Verbos pt-BR de coleta que disparam a reconciliação de quantidade. */
const COLLECT_VERB = /(peguei|coletei|minerei|consegui|obtive|juntei)/i
/** Captura: <verbo> <número> — o número é o que reconciliamos ao grounded. Global p/ múltiplas ocorrências. */
const QUANTITY_RE = /\b(peguei|coletei|minerei|consegui|obtive|juntei)\s+(\d+)\b/gi

/**
 * Reescreve afirmações de quantidade de coleta na fala para o número observado real (D-10).
 *
 * Gate DETERMINÍSTICO final no ponto de saída de fala: o LLM local fraco drifta mesmo com o
 * prompt autoritativo (camada A), então esta camada C fecha o gap reescrevendo "peguei 10" →
 * "peguei 3" (ou "peguei 0" em no_effect). Escopo MÍNIMO — só o padrão de coleta que o
 * critério GRND-02 #3 mede; NÃO valida NLG em geral.
 *
 * @param reply  texto do LLM (não confiável).
 * @param fact   último delta observado (holder.lastObservedDelta) ou null.
 * @returns fala com os números de coleta reconciliados ao grounded; inalterada se não houver padrão/fact.
 */
export function reconcileQuantities(reply: string, fact: ObservedDeltaFact | null): string {
  if (!fact) return reply // sem delta autoritativo, não há o que reconciliar
  if (!COLLECT_VERB.test(reply)) return reply // sem padrão de coleta → não toca
  // observed é a fonte de verdade (D-06). Para no_effect, observed é 0.
  const grounded = fact.observed
  return reply.replace(QUANTITY_RE, (_m, verb: string, num: string) => {
    const claimed = parseInt(num, 10)
    if (claimed === grounded) return `${verb} ${num}` // bate → preserva a fala original
    return `${verb} ${grounded}` // reescreve para o número grounded (D-10)
  })
}
