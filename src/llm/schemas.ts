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
//   craft    -> 'building' (skill craft)      — G-01
//   smelt    -> 'building' (skill smelt)      — G-01
//   equip    -> 'building' (skill equip)      — G-01
//   place    -> 'building' (skill placeBlock) — G-01
//
// IMPORTANTE (D-10, Fase 1): o LLM só escolhe AÇÃO + ALVO de alto nível. Os
// parâmetros físicos da skill (coordenadas, range, etc.) são validados DEPOIS
// pelos schemas Zod do toolRegistry (src/skills). O LLM jamais monta a chamada
// física diretamente — isso mantém a superfície de tampering mínima (T-03-01).
import { z } from 'zod'

/** Conjunto FECHADO de ações que o LLM pode escolher (LLM-02). */
export const ActionDecisionSchema = z.object({
  /** Ação de alto nível — enum FECHADO; qualquer valor fora disto é rejeitado por .parse(). */
  action: z
    .enum(['gather', 'explore', 'navigate', 'idle', 'chat', 'craft', 'smelt', 'equip', 'place'])
    .describe(
      'gather=coletar bloco próximo; explore=vagar p/ achar terreno novo; ' +
        'navigate=ir até alvo conhecido; idle=descansar; chat=falar com jogador próximo; ' +
        'craft=craftar item (target=nome do item, opcional :N para quantidade); ' +
        'smelt=fundir minério (target=nome do minério); ' +
        'equip=equipar ferramenta/armadura (target=nome do item); ' +
        'place=colocar bloco (target="nome @ x,y,z")',
    ),
  /** Alvo opcional de alto nível (ex.: tipo de bloco "oak_log", username, coordenada textual). */
  target: z
    .string()
    .max(64)
    .optional()
    .describe(
      'gather/navigate: nome do bloco (ex: oak_log) ou "x,y,z"; explore: direção ' +
        '(norte/sul/leste/oeste); chat: username; ' +
        'craft: nome do item, opcionalmente "nome:N" (ex: "stick", "wooden_pickaxe:1"); ' +
        'smelt: nome do minério (ex: "iron_ore", "raw_iron"); ' +
        'equip: nome do item (ex: "stone_pickaxe"), opcionalmente "nome@slot" (head/torso/legs/feet/off-hand); ' +
        'place: "nome_do_bloco @ x,y,z" (ex: "cobblestone @ 10,64,-3"). Omita para idle.',
    ),
  /** Justificativa curta da decisão (obrigatória — força o modelo a "pensar"). */
  reason: z.string().max(200).describe('Uma frase curta justificando a decisão.'),
})

/** Decisão de ação validada — o tipo consumido pela cognição. */
export type ActionDecision = z.infer<typeof ActionDecisionSchema>

/**
 * Saída restrita da reflexão (REFL-01/D-13): consolidação + deltas de objetivo.
 * O modelo local NUNCA calcula trust/personalidade aqui — apenas resume e propõe
 * reordenar/dropar objetivos existentes (a aplicação é validada/clamada em reflection.ts).
 */
export const ReflectionOutputSchema = z.object({
  summary: z.string().max(500),
  goalUpdates: z.array(z.object({
    id: z.string(),
    action: z.enum(['keep', 'drop', 'reprioritize']),
    priority: z.number().optional().describe('urgência normalizada em [0,1]; valores fora da faixa são clampados na aplicação'),
  })).max(8).default([]),
})

/** Produto validado de uma reflexão (REFL-01) — consumido por reflection.ts. */
export type ReflectionOutput = z.infer<typeof ReflectionOutputSchema>
