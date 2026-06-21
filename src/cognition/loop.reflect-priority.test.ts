// src/cognition/loop.reflect-priority.test.ts
// IR4: regressão da starvation da reflexão. pickDispatch dá PRIORIDADE ao reflect quando devido
// e o lock está livre, preservando o single-flight (D-12). Antes do fix a ação tomava o lock
// sincronamente todo tick e a reflexão nunca rodava (events type='reflection' = 0 ao vivo).
import { test, expect } from 'bun:test'
import { pickDispatch } from './loop'
import { shouldReflect } from './reflection'
import { config } from '../config'

test('pickDispatch: reflect tem prioridade quando devido e nada in-flight (mata a starvation)', () => {
  expect(pickDispatch({ inFlight: false, reflectDue: true })).toBe('reflect')
})

test('pickDispatch: cai na ação quando reflect não é devido', () => {
  expect(pickDispatch({ inFlight: false, reflectDue: false })).toBe('action')
})

test('pickDispatch: in-flight ⇒ none (single-flight D-12 preservado)', () => {
  expect(pickDispatch({ inFlight: true, reflectDue: true })).toBe('none')
  expect(pickDispatch({ inFlight: true, reflectDue: false })).toBe('none')
})

test('cenário ao vivo: acúmulo > limiar com lock livre ⇒ reflect (não action)', () => {
  // Reproduz o estado do minemind.sqlite ao vivo: importância 85 vs limiar 50.
  const reflectDue = shouldReflect({
    enteredIdle: false,
    goalDoneOrFailed: false,
    importanceAccum: config.reflectionImportanceThreshold + 35,
    lastReflectionAt: 0,
    now: 1, // dentro do piso temporal → só o acúmulo decide
  })
  expect(reflectDue).toBe(true)
  // Com o lock livre, o dispatch DEVE ser reflect — antes do fix a ação tomava o lock e isto seria 'action'.
  expect(pickDispatch({ inFlight: false, reflectDue })).toBe('reflect')
})
