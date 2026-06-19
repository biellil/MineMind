// src/cognition/states.ts
// COG-02 / D-05 / D-06: estados e ordem de prioridade fixa.
import type { CognitiveState } from './types'
export type { CognitiveState } from './types'

/** Ordem de prioridade fixa de arbitragem (D-05), do mais ao menos prioritário. */
export const PRIORITY_ORDER: ReadonlyArray<CognitiveState> = ['socializing', 'gathering', 'exploring', 'idle']

/** Estados stub (D-06): entram no enum mas não têm lógica real. */
export const STUB_STATES: ReadonlyArray<CognitiveState> = ['fighting', 'building']

export function isStub(s: CognitiveState): boolean {
  return STUB_STATES.includes(s)
}
