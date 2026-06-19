// src/cognition/arbiter.ts
// D-05: arbitragem por prioridade fixa. D-07: escada de Gathering de sobrevivência.
// Funções PURAS: leem apenas o WorldSnapshot (read-only) e config estática.
// Sem efeito colateral, sem bot, sem LLM.
import type { WorldSnapshot } from '../perception/types'
import type { CognitiveState, ControlMode } from './types'
import { config } from '../config'

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
