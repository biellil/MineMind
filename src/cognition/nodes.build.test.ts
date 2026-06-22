// src/cognition/nodes.build.test.ts
// Plan 12-02 / Task 2 / D-13: roteador determinístico de goals build:*.
// Testa a função PURA buildGoalToSkillParams — espelho de goalToSkillParams (Fase 10),
// caminho SEPARADO do dispatch G-01 (D-14) e do roteador DAG.
import { test, expect } from 'bun:test'
import { buildGoalToSkillParams } from './nodes'

test('build:shelter → skill build com tipo shelter', () => {
  expect(buildGoalToSkillParams('build:shelter')).toEqual({
    skill: 'build',
    paramsJson: JSON.stringify({ tipo: 'shelter' }),
  })
})

test('build:wall → skill build com tipo wall', () => {
  expect(buildGoalToSkillParams('build:wall')).toEqual({
    skill: 'build',
    paramsJson: JSON.stringify({ tipo: 'wall' }),
  })
})

test('build:station → skill build com tipo station', () => {
  expect(buildGoalToSkillParams('build:station')).toEqual({
    skill: 'build',
    paramsJson: JSON.stringify({ tipo: 'station' }),
  })
})

test('gather:oak_log → null (prefixo errado, não toca o canal DAG)', () => {
  expect(buildGoalToSkillParams('gather:oak_log')).toBeNull()
})

test('build: (sub vazio) → null', () => {
  expect(buildGoalToSkillParams('build:')).toBeNull()
})
