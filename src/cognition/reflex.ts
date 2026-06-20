// src/cognition/reflex.ts
// System 1 — DECISÃO reflexa pura (D-01). Esta é a "função pura no driver": dado um snapshot
// de sensores, decide QUAL reflexo vence por gravidade (D-03), separado do ABORT FÍSICO (nó
// execute, Plan 04). Módulo PURO — importa só `config`, NUNCA `Bot` (testável por tabela-verdade).
import { config } from '../config'

/** Snapshot mínimo de sensores que a arbitragem reflexa lê (derivado do WorldSnapshot/bot no driver). */
export interface ReflexSensors {
  /** food do bot [0,20] */
  food: number
  /** health do bot [0,20] */
  health: number
  /** oxygen do bot [0,20] (20 fora d'água) */
  oxygen: number
  /** se é noite no mundo */
  isNight: boolean
  /** mob hostil mais próximo (já filtrado), ou null */
  nearestHostile: { kind: string; name: string; distance: number } | null
  /** lava no lookahead à frente */
  lavaAhead: boolean
  /** blocos de queda à frente (0 = chão plano) */
  fallAhead: number
  /** A* de fuga deu noPath/timeout — encurralado (D-16) */
  cornered: boolean
}

/** Reflexo vencedor + se é vida-crítica (D-02: fome NÃO é vida-crítica). */
export interface ReflexDecision {
  reflex: 'eat' | 'flee' | 'shelter' | 'retreatEnv' | 'defend'
  lifeCritical: boolean
}

/**
 * Distância-limite de reação por tipo de mob (D-13). Reação graduada:
 * creeper reage de mais longe (explode), skeleton é ranged, melee genérico mais perto.
 * Retorna 0 para kind não-hostil (nunca dispara).
 */
export function hostileThreatDistance(kind: string, name: string): number {
  if (kind !== 'Hostile mobs') return 0
  const n = name.toLowerCase()
  if (n.includes('creeper')) return config.creeperReactDistance
  if (n.includes('skeleton')) return config.rangedReactDistance
  return config.meleeReactDistance
}

/** True se há mob hostil dentro da sua distância graduada de reação (D-13). */
export function isHostileThreat(s: ReflexSensors): boolean {
  return (
    s.nearestHostile != null &&
    s.nearestHostile.distance <= hostileThreatDistance(s.nearestHostile.kind, s.nearestHostile.name)
  )
}

/**
 * Guardas reflexas ORDENADAS por gravidade (D-03): ambiental > hostil > queda > vida-crítica > fome.
 * Winner-take-all (D-01): a primeira guarda não-nula vence.
 *
 * D-17: abrigo NÃO é guarda isolada por anoitecer. É variação do caminho hostil: quando encurralado
 * (sem fuga) À NOITE com ameaça, vale mais a pena se abrigar do que revidar a céu aberto → 'shelter'.
 * Encurralado de dia → 'defend'. Com fuga disponível → 'flee'.
 */
export const REFLEX_GUARDS: Array<(s: ReflexSensors) => ReflexDecision | null> = [
  // 1) Ambiental (lava / afogamento) — maior prioridade, vence até hostil.
  (s) => (s.lavaAhead || s.oxygen <= config.oxygenEmergeThreshold) ? { reflex: 'retreatEnv', lifeCritical: true } : null,
  // 2) Hostil dentro do alcance graduado.
  (s) => {
    if (!isHostileThreat(s)) return null
    if (s.cornered) return s.isNight ? { reflex: 'shelter', lifeCritical: true } : { reflex: 'defend', lifeCritical: true }
    return { reflex: 'flee', lifeCritical: true }
  },
  // 3) Queda perigosa à frente.
  (s) => (s.fallAhead > config.fallDangerBlocks) ? { reflex: 'retreatEnv', lifeCritical: true } : null,
  // 4) Vida crítica sem ameaça localizada → recua/foge.
  (s) => (s.health <= config.healthCriticalThreshold) ? { reflex: 'flee', lifeCritical: true } : null,
  // 5) Fome — NUNCA preempta (D-02), lifeCritical=false.
  (s) => (s.food <= config.hungryThreshold) ? { reflex: 'eat', lifeCritical: false } : null,
]

/**
 * Decisão reflexa pura (D-01): percorre REFLEX_GUARDS por gravidade e devolve o primeiro
 * reflexo não-nulo (winner-take-all), ou null se nenhum reflexo é necessário.
 */
export function arbitrateReflex(s: ReflexSensors): ReflexDecision | null {
  for (const guard of REFLEX_GUARDS) {
    const decision = guard(s)
    if (decision) return decision
  }
  return null
}
