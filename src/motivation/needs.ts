// src/motivation/needs.ts
// NEED-01/02: necessidades híbridas com decaimento + anti-starvation.
// Módulo PURO (estilo arbiter.ts/safety.ts): lê WorldSnapshot read-only + tempo
// por parâmetro. SEM Date.now(), SEM config global — cfg entra por parâmetro.
import type { WorldSnapshot } from '../perception/types'
import { ACTIVE_NEEDS, STUB_NEEDS, type MotivationConfig, type Need, type NeedKind } from './types'

const ALL_NEEDS: NeedKind[] = [...ACTIVE_NEEDS, ...STUB_NEEDS]

/** Inicializa as 5 needs satisfeitas (value 1) com lastSatisfiedAt = now. */
export function createNeeds(now: number): Need[] {
  return ALL_NEEDS.map((kind) => ({ kind, value: 1, lastSatisfiedAt: now }))
}

/**
 * Satisfação de recursos (D-09): fração de cfg.resourceTargets cujo nome aparece
 * no inventário, clampada em 0..1. Targets vazios -> 1 (nada a buscar = satisfeito).
 */
function resourceSatisfaction(
  inventory: WorldSnapshot['inventory'],
  cfg: MotivationConfig,
): number {
  const targets = cfg.resourceTargets
  if (targets.length === 0) return 1
  const present = new Set(inventory.map((s) => s.name))
  const have = targets.filter((t) => present.has(t)).length
  return clamp01(have / targets.length)
}

/**
 * Avalia as necessidades (D-09 híbrido):
 * - survival = média de health/20 e food/20 (do snapshot).
 * - resources = fração de resourceTargets presentes no inventário (do snapshot).
 * - curiosity decai por timer desde lastSatisfiedAt.
 * - shelter/social: stub (D-08) — retornados inalterados.
 */
export function evaluateNeeds(
  prev: Need[],
  snap: WorldSnapshot,
  now: number,
  cfg: MotivationConfig,
): Need[] {
  return prev.map((n) => {
    let value = n.value
    if (n.kind === 'survival') {
      value = clamp01((snap.status.health / 20 + snap.status.food / 20) / 2)
    } else if (n.kind === 'resources') {
      value = resourceSatisfaction(snap.inventory, cfg)
    } else if (n.kind === 'curiosity') {
      value = Math.max(0, n.value - cfg.curiosityDecayPerMs * (now - n.lastSatisfiedAt))
    }
    // shelter/social caem aqui sem alteração (stub D-08).
    return { ...n, value }
  })
}

/**
 * Urgência (anti-starvation NEED-02/D-11): cresce monotonicamente com o tempo
 * desde lastSatisfiedAt, ponderada pelo peso da necessidade (D-10).
 *   urgency = weights[kind] * ((1 - value) + starvationBoostPerMs * ignoredMs)
 */
export function urgency(n: Need, now: number, cfg: MotivationConfig): number {
  const ignoredMs = now - n.lastSatisfiedAt
  return cfg.weights[n.kind] * ((1 - n.value) + cfg.starvationBoostPerMs * ignoredMs)
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x))
}
