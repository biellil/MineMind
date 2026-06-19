// src/control/disposition.ts
// D-05: eixo de DISPOSIÇÃO (ortogonal ao controle da Fase 2) + parser de comando literal de chat (SEM LLM).
// Espelha o padrão literal/imutável de commands.ts: lookup EXATO em um mapa Object.freeze.
// Segurança ASVS V5: nenhum eval/Function/interpolação — entrada desconhecida é ignorada (no-op).
// ISOLAMENTO (Pattern 5 / Pitfall 6): disposição é parseada SEPARADAMENTE do controle; nenhuma
// keyword de um vaza para o outro (!ajudante/!sozinho aqui; !auto/!livre/!pausar/... em commands.ts).
import type { Disposition } from '../llm/prompts'

/** Mapa literal palavra-chave -> disposição (D-05). Match EXATO após trim+lowercase. */
export const DISPOSITION_COMMANDS: Readonly<Record<string, Disposition>> = Object.freeze({
  '!ajudante': 'ASSISTANT',
  '!sozinho': 'AUTONOMOUS',
})

/**
 * Mapeia uma mensagem de chat para uma disposição, ou null se não for comando reconhecido.
 * Match literal exato — segurança ASVS V5: nenhuma interpolação/eval, ignora entrada desconhecida.
 * NÃO reconhece comandos de controle (!auto/!livre/...) — isolamento controle<->disposição.
 */
export function parseDisposition(message: string): Disposition | null {
  const key = message.trim().toLowerCase()
  return Object.prototype.hasOwnProperty.call(DISPOSITION_COMMANDS, key)
    ? DISPOSITION_COMMANDS[key]!
    : null
}
