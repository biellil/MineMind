// src/memory/recordEvent.ts
// D-06/D-08: helper central de gravação de eventos. Substitui os push(holder.memory, …) espalhados
// nos pontos de origem do loop (loop.ts:125, nodes.ts:238/302/322). Faz DUAS coisas:
//  - push na memória de curto prazo (CP) — comportamento que já existia;
//  - persistEvent na memória de longo prazo (LP) com embedding NULL — o que estava FALTANDO (bug
//    de fiação: persistEvent só era chamado em testes → events=0 ao vivo).
// O embedding é SEMPRE null aqui: NÃO embeddar no caminho quente (D-07 — o único embed é o batch
// da reflexão). retrieve já degrada gracioso para recência quando o evento não tem embedding.
// NUNCA lança (Core Value: o loop nunca aborta) — persistEvent é envolto em try/catch.
import type { MemEvent } from '../cognition/types'
import type { CognitiveStateHolder } from '../cognition/state'
import { push } from './shortTerm'
import { persistEvent } from './longTerm'

export function recordEvent(
  holder: CognitiveStateHolder,
  e: MemEvent,
  now: number,
  player?: string | null,
): void {
  // CP: ring buffer imutável — reatribui (o holder é a fonte única).
  holder.memory = push(holder.memory, e)
  // LP: embedding null (D-06). Degradação graciosa — nunca propaga.
  if (holder.db) {
    try {
      persistEvent(holder.db, e, null, now, player)
    } catch (err) {
      console.error('[recordEvent] persistEvent falhou (degradando):', err instanceof Error ? err.message : err)
    }
  }
}
