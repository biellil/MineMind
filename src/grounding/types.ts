// src/grounding/types.ts
// Fase 7 — contrato de grounding. SkillResult deriva de delta REAL observado, nunca da Promise.
import type { Position3D } from '../perception/types'

/** Discriminante string-literal do resultado de uma skill (D-01/D-06). */
export type SkillOutcome = 'success' | 'partial' | 'no_effect' | 'error'

/**
 * Snapshot imutável do estado do mundo relevante a uma ação, capturado antes/depois (D-04).
 * Numérico onde possível para o evaluate comparar sem mock de bot.
 */
export interface GroundState {
  /** Soma total de itens no inventário (generaliza o progressChecker do dig). */
  readonly inventoryCount: number
  /** Contagem por nome de item (ex.: {'oak_planks': 3}) — fonte do delta por-item. */
  readonly itemsByName: Readonly<Record<string, number>>
  /** Posição do bot no momento da captura. */
  readonly position: Position3D
  /** Nome do bloco no alvo XYZ (quando a skill mira posição); null se N/A. */
  readonly targetBlockName: string | null
  /** Timestamp Unix (ms) da captura. */
  readonly capturedAt: number
}

/** Delta inventário antes→depois, por nome de item (apenas chaves que mudaram). */
export type InventoryDelta = Readonly<Record<string, number>>

/**
 * Resultado verificado de uma skill (D-01). Base FLAT tagueada por `outcome`.
 * `outcome` deriva de `observed` vs `expected` — NUNCA da resolução da Promise (GRND-01).
 * `no_effect` = Promise resolveu mas o mundo não mudou (a alucinação "peguei 10 tábuas").
 * `error` = exceção lançada; distinto de partial/no_effect (falhas observadas).
 */
export interface SkillResult {
  readonly outcome: SkillOutcome
  /** Quantidade REAL observada (itens coletados, ou 1/0 para chegou/não-chegou). Fonte da verdade. */
  readonly observed: number
  /** Quantidade esperada derivada dos params (count do dig; 1 para navigate). */
  readonly expected: number
  /** Delta de inventário por item (chaves que mudaram). Vazio quando irrelevante. */
  readonly delta: InventoryDelta
  /** Motivo legível (timeout, stuck, não implementado, exceção). Opcional em success. */
  readonly reason?: string
}
