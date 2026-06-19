// src/cognition/state.test.ts
// CONN-03/D-20: o holder é a fonte única em-processo da mente do agente.
// D-06/D-10: motivationConfigFor entrega pesos distintos por disposição.
import { test, expect } from 'bun:test'
import { createCognitiveStateHolder } from './state'
import { motivationConfigFor } from '../config'
import { ACTIVE_NEEDS, STUB_NEEDS, type NeedKind } from '../motivation/types'

test('createCognitiveStateHolder inicializa needs com as 5 kinds e campos default', () => {
  const holder = createCognitiveStateHolder(1000)
  const kinds = holder.needs.map((n) => n.kind).sort()
  const expected = [...ACTIVE_NEEDS, ...STUB_NEEDS].sort() as NeedKind[]
  expect(kinds).toEqual(expected)
  expect(holder.needs).toHaveLength(5)
  // disposition vem do default da config (AUTONOMOUS em ambiente limpo)
  expect(['AUTONOMOUS', 'ASSISTANT']).toContain(holder.disposition)
  expect(holder.playerRequestPending).toBe(false)
  expect(holder.llmDecision).toBeNull()
  expect(holder.currentGoal).toBeNull()
  expect(holder.goals).toEqual([])
})

test('control/safety/memory existem no holder (estado antes por-sessão agora durável)', () => {
  const holder = createCognitiveStateHolder()
  expect(typeof holder.control.getMode).toBe('function')
  expect(holder.control.getMode()).toBe('autonomous')
  expect(holder.safety.cooldownUntil instanceof Map).toBe(true)
  expect(Array.isArray(holder.memory.events)).toBe(true)
})

test('mutar holder.needs/holder.goals reflete no mesmo objeto (fonte única em-processo)', () => {
  const holder = createCognitiveStateHolder(0)
  const ref = holder
  holder.needs = holder.needs.map((n) => ({ ...n, value: 0.42 }))
  holder.goals = [
    { id: 'need:survival', kind: 'survival', priority: 1, progress: 0, dependsOn: [], source: 'need', committedAt: 0 },
  ]
  holder.playerRequestPending = true
  // a referência aponta para o MESMO objeto (mutação visível por quem segura o holder)
  expect(ref.needs[0]!.value).toBe(0.42)
  expect(ref.goals).toHaveLength(1)
  expect(ref.playerRequestPending).toBe(true)
})

test('motivationConfigFor retorna weights distintos por disposição (D-06/D-10)', () => {
  const auto = motivationConfigFor('AUTONOMOUS')
  const assistant = motivationConfigFor('ASSISTANT')
  // curiosity menor em ASSISTANT (fica mais disponível ao jogador)
  expect(auto.weights.curiosity).not.toBe(assistant.weights.curiosity)
  expect(assistant.weights.curiosity).toBeLessThan(auto.weights.curiosity)
  // survival como PISO anti-starvation: nunca abaixo das demais necessidades ativas
  expect(assistant.weights.survival).toBeGreaterThanOrEqual(assistant.weights.resources)
  expect(assistant.weights.survival).toBeGreaterThanOrEqual(assistant.weights.curiosity)
  // demais knobs compartilhados presentes
  expect(auto.goalThreshold).toBeGreaterThanOrEqual(0)
  expect(Array.isArray(auto.resourceTargets)).toBe(true)
})
