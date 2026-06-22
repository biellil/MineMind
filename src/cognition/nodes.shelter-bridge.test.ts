// src/cognition/nodes.shelter-bridge.test.ts
// Plan 12-03 / Task 1 / D-12: ponte de abrigo (noite + exposto → goal build:shelter).
// Testa a condição PURA shouldBuildShelter — a ponte está embutida no observe (precisa de
// bot+holder+provider), então cobrimos a decisão extraída no helper puro. O helper recebe
// `isNight` JÁ DERIVADO (`!snapshot.status.isDay`), nunca o campo bruto timeOfDay — mantém o
// teste alinhado à escala normalizada (Pitfall: timeOfDay é 0.0–1.0, NÃO o tick 0–24000).
import { test, expect } from 'bun:test'
import { shouldBuildShelter } from './nodes'

test('noite + exposto + seguro + sem build em curso → true (abrigo deliberado dispara)', () => {
  expect(shouldBuildShelter(true, true, false, null)).toBe(true)
})

test('dia (isNight=false) → false (não constrói abrigo de dia)', () => {
  expect(shouldBuildShelter(false, true, false, null)).toBe(false)
})

test('com teto (exposed=false) → false (já abrigado)', () => {
  expect(shouldBuildShelter(true, false, false, null)).toBe(false)
})

test('sobrevivência crítica → false (reflexo de emergência da Fase 8 mantém precedência, D-15)', () => {
  expect(shouldBuildShelter(true, true, true, null)).toBe(false)
})

test('goal atual já é build:* → false (evita re-commit/duplicação a cada tick)', () => {
  expect(shouldBuildShelter(true, true, false, 'build:shelter')).toBe(false)
})

test('goal atual não-build (ex: gather:) NÃO bloqueia → true', () => {
  expect(shouldBuildShelter(true, true, false, 'gather:oak_log')).toBe(true)
})
