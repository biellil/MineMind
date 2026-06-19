// src/memory/holder.persistence.ts
// MEM-02 / D-04 / D-19: torna a "mente" durável EM DISCO. Serializa o estado VIVO do holder
// (needs/goals/currentGoal/disposition/personality) na tabela `kv` e o hidrata de volta no boot
// aplicando DECAY-ON-BOOT — mitigação de estado estálido (Pattern 7 / Pitfall 4):
//   - curiosity re-decai por tempo desde lastSatisfiedAt (clamp 0); survival/resources são
//     recomputados do snapshot do mundo no 1º tick (evaluateNeeds), então aqui são no-op;
//   - goals comprometidos velhos demais (committedAt > goalStaleMs) são descartados;
//   - personality passa por mean-reversion (decayPersonality) pelo tempo decorrido.
// control/safety/memory são por-sessão e NÃO persistem aqui.
import type { Database } from 'bun:sqlite'
import type { CognitiveStateHolder } from '../cognition/state'
import type { Disposition, Goal, Need } from '../motivation/types'
import type { PersonalityState } from '../cognition/personality'
import { kvSet, kvGet } from './persistence'
import { decayPersonality, defaultPersonality } from '../cognition/personality'
import { config } from '../config'

const HOLDER_KEY = 'holder'

/** Forma exata do snapshot serializado em kv['holder'] (D-04). */
interface HolderSnapshot {
  needs: Need[]
  goals: Goal[]
  currentGoal: Goal | null
  disposition: Disposition
  personality?: PersonalityState
}

/**
 * Serializa o estado vivo do holder na tabela kv (D-04). control/safety/memory são por-sessão
 * (não persistem). No-op gracioso se `db` é null. O Plan 07 chama isto ao fim de cada reflexão.
 */
export function persistHolder(db: Database | null, holder: CognitiveStateHolder, now: number): void {
  if (!db) return
  const snap: HolderSnapshot = {
    needs: holder.needs,
    goals: holder.goals,
    currentGoal: holder.currentGoal,
    disposition: holder.disposition,
    personality: holder.personality,
  }
  kvSet(db, HOLDER_KEY, JSON.stringify(snap), now)
}

/**
 * Hidrata o holder do disco aplicando decay-on-boot (D-19). Muta os campos vivos de `holder` e
 * o retorna. No-op gracioso se `db` é null ou não há snapshot (cold start, D-03 — retorna o
 * holder base inalterado).
 */
export function hydrateHolder(db: Database | null, holder: CognitiveStateHolder, now: number): CognitiveStateHolder {
  if (!db) return holder
  const raw = kvGet(db, HOLDER_KEY)
  if (!raw) return holder // cold start (D-03)
  const snap = JSON.parse(raw) as HolderSnapshot

  // DECAY-ON-BOOT (D-19 / Pitfall 4):
  //  - needs: re-decair curiosity por tempo desde lastSatisfiedAt (clamp 0). survival/resources
  //    serão recalculados do snapshot do mundo no 1º tick (evaluateNeeds) — aqui só preservamos.
  const needs = snap.needs.map((n) => {
    if (n.kind === 'curiosity') {
      const value = Math.max(0, n.value - config.curiosityDecayPerMs * (now - n.lastSatisfiedAt))
      return { ...n, value }
    }
    return n
  })
  //  - goals: descartar comprometidos velhos demais (não retomar cego).
  const goals = snap.goals.filter((g) => now - g.committedAt < config.goalStaleMs)
  const currentGoal =
    snap.currentGoal && goals.some((g) => g.id === snap.currentGoal!.id) ? snap.currentGoal : null
  //  - personality: mean-reversion por tempo decorrido.
  const personality = decayPersonality(snap.personality ?? defaultPersonality(now), now)

  holder.needs = needs
  holder.goals = goals
  holder.currentGoal = currentGoal
  holder.disposition = snap.disposition
  holder.personality = personality
  return holder
}
