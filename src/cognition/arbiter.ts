// src/cognition/arbiter.ts
// D-05: arbitragem por prioridade fixa. D-07: escada de Gathering de sobrevivência.
// Funções PURAS: leem apenas o WorldSnapshot (read-only) e config estática.
// Sem efeito colateral, sem bot, sem LLM.
import type { WorldSnapshot } from '../perception/types'
import type { CognitiveState, ControlMode } from './types'
import { config } from '../config'
import { shouldAbandon, cooledDownTargets } from './safety'
import type { SafetyState } from './safety'
import type { SkillOutcome } from '../grounding/types'

/**
 * Retorna o tipo de bloco de MAIOR prioridade da escada (config.gatheringLadder)
 * que esteja presente em nearbyBlockTypes e NÃO esteja em excludeTargets (cooldown).
 * null se nenhum alvo elegível.
 */
export function highestPriorityGatherTarget(
  s: WorldSnapshot,
  excludeTargets: ReadonlySet<string> = new Set(),
): string | null {
  for (const blockType of config.gatheringLadder) {       // escada ordenada por prioridade
    if (excludeTargets.has(blockType)) continue
    const entry = s.nearbyBlockTypes[blockType]
    if (entry && entry.count > 0) return blockType
  }
  return null
}

/** True se há um jogador dentro de config.socialRadius. */
export function hasNearbyPlayer(s: WorldSnapshot): boolean {
  return s.players.some((p) => (p.distance ?? Infinity) <= config.socialRadius)
}

/**
 * Arbitragem por prioridade fixa (D-05): Socializing > Gathering > Exploring > Idle.
 * O modo de controle (D-08) sobrepõe a prioridade autônoma.
 */
export function arbitrate(
  s: WorldSnapshot,
  mode: ControlMode,
  excludeTargets: ReadonlySet<string> = new Set(),
): CognitiveState {
  if (mode === 'paused') return 'idle'            // freio: não age
  if (mode === 'standby') return 'socializing'    // vem para perto e aguarda
  if (hasNearbyPlayer(s)) return 'socializing'
  if (highestPriorityGatherTarget(s, excludeTargets) !== null) return 'gathering'
  return 'exploring'                              // fallback antes de idle
}

/**
 * Passo mecânico determinístico de uma skill: nome da skill e target serializado.
 * null = não há passo mecânico óbvio → delegar ao LLM (D-06).
 */
export interface MechanicalStep {
  /** Nome da skill a executar (e.g., 'dig', 'navigate') */
  readonly skill: string
  /** Target serializado (string para dig, JSON para navigate) */
  readonly target: string
}

/**
 * Classificador com caminho null (D-06/D-07):
 * - Retorna MechanicalStep quando há uma ação determinística clara (ex.: gathering com alvo disponível).
 * - Retorna null quando não há passo mecânico óbvio → sinal explícito para escalar ao LLM.
 *
 * Ordem das verificações importa:
 * 1. Gate de outcome (D-07): no_effect/partial + shouldAbandon → null (força LLM).
 * 2. Gate de modo: paused → null.
 * 3. Gate de socializing: player próximo → null (interação social é decisão real do LLM).
 * 4. Gate de standby → null.
 * 5. Passo mecânico de gathering: alvo de coleta disponível → { skill: 'dig', target }.
 * 6. Exploring: NÃO é mecânico (D-06) → null (vagar vai ao LLM para decidir posição).
 */
export function nextMechanicalStep(
  snapshot: WorldSnapshot,
  mode: ControlMode,
  safety: SafetyState,
  outcome: SkillOutcome | null,
): MechanicalStep | null {
  // 1. Gate de outcome (D-07): no_effect/partial indica "tentativa sem progresso real".
  //    Se shouldAbandon ativo → forçar LLM. Caso contrário, continua avaliando.
  if (outcome === 'no_effect' || outcome === 'partial') {
    if (shouldAbandon(safety)) return null
  }

  // 2. Gate de modo: paused → não age
  if (mode === 'paused') return null

  // 3. Gate de socializing: player próximo → LLM decide como interagir
  if (hasNearbyPlayer(snapshot)) return null

  // 4. Gate de standby → aguarda instrução do LLM
  if (mode === 'standby') return null

  // 5. Passo mecânico de gathering: verifica alvos fora do cooldown
  const excluded = cooledDownTargets(safety, Date.now())
  const gatherTarget = highestPriorityGatherTarget(snapshot, excluded)
  if (gatherTarget !== null) return { skill: 'dig', target: gatherTarget }

  // 6. Exploring NÃO é mecânico (D-06): vagar aleatório sempre vai ao LLM
  return null
}
