// src/cognition/loop.reflect-priority.test.ts
// Phase 10.1-02 (D-01/Pitfall 6): pickDispatch DEIXA DE SER XOR. Com gate por tipo + semáforo,
// reflexão e ação podem ser despachadas no MESMO tick (o gate por tipo + o semáforo coordenam,
// não a exclusão mútua do pickDispatch antigo). pickDispatch vira um HINT: diz O QUE despachar
// (reflect quando devido e o gate reflection livre; ação quando o gate action livre), sem mais
// bloquear a ação por causa de uma reflexão devida.
//
// Mantém a garantia IR4: reflect ainda tem PRIORIDADE de permit quando o semáforo é escasso
// (prioridade 2 vs 1 na fila — testado em deliberation/concurrency), mas a AÇÃO não é mais
// bloqueada por reflect quando há gate/permit livre.
import { test, expect } from 'bun:test'
import { pickDispatch } from './loop'
import { shouldReflect } from './reflection'
import { config } from '../config'

test('pickDispatch: reflect devido + gate reflection livre ⇒ despacha reflect', () => {
  const d = pickDispatch({ reflectDue: true, reflectionBusy: false, actionBusy: false })
  expect(d.reflect).toBe(true)
})

test('pickDispatch: ação NÃO é bloqueada por reflect devido (deixa de ser XOR — Pitfall 6)', () => {
  // antes: reflectDue ⇒ dispatch 'reflect' e a ação NÃO rodava. Agora ambos podem.
  const d = pickDispatch({ reflectDue: true, reflectionBusy: false, actionBusy: false })
  expect(d.reflect).toBe(true)
  expect(d.action).toBe(true) // a ação coexiste — o gate/semáforo é quem coordena
})

test('pickDispatch: reflect não devido ⇒ só ação', () => {
  const d = pickDispatch({ reflectDue: false, reflectionBusy: false, actionBusy: false })
  expect(d.reflect).toBe(false)
  expect(d.action).toBe(true)
})

test('pickDispatch: gate action ocupado ⇒ não redispacha ação (não sobrepõe o mesmo tipo)', () => {
  const d = pickDispatch({ reflectDue: false, reflectionBusy: false, actionBusy: true })
  expect(d.action).toBe(false)
})

test('pickDispatch: gate reflection ocupado ⇒ não redispacha reflect mesmo se devido', () => {
  const d = pickDispatch({ reflectDue: true, reflectionBusy: true, actionBusy: false })
  expect(d.reflect).toBe(false)
})

test('cenário ao vivo: acúmulo > limiar ⇒ reflect devido (e a ação ainda pode rodar)', () => {
  // Reproduz o estado do minemind.sqlite ao vivo: importância 85 vs limiar 50.
  const reflectDue = shouldReflect({
    enteredIdle: false,
    goalDoneOrFailed: false,
    importanceAccum: config.reflectionImportanceThreshold + 35,
    lastReflectionAt: 0,
    now: 1, // dentro do piso temporal → só o acúmulo decide
  })
  expect(reflectDue).toBe(true)
  const d = pickDispatch({ reflectDue, reflectionBusy: false, actionBusy: false })
  expect(d.reflect).toBe(true) // a reflexão NÃO starva — é despachada (e priorizada no semáforo)
  expect(d.action).toBe(true) // mas a ação não é mais bloqueada por ela (Pitfall 6)
})
