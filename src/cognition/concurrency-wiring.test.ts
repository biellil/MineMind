// src/cognition/concurrency-wiring.test.ts
// Phase 10.1-02 / D-08/D-11/D-12/D-13: fiação das primitivas no driver.
// Cobre os helpers PUROS extraídos do loop p/ testabilidade:
//   - routePlayerTurn: o turno conversacional atravessa o gate 'player' + semáforo (prioridade 0),
//     preempta a ação em voo ANTES de adquirir, e libera (release/leave) no finally MESMO com throw.
//   - shouldPreemptAction: o player só preempta quando há ação em voo (função pura).
import { test, expect, mock } from 'bun:test'
import { routePlayerTurn, shouldPreemptAction } from './loop'
import { Semaphore, createTaskGate } from './concurrency'

test('routePlayerTurn: entra no gate player, preempta a ação, adquire/libera o semáforo', async () => {
  const semaphore = new Semaphore(1)
  const gate = createTaskGate()
  const preempt = mock(() => {})
  const run = mock(async () => {})

  await routePlayerTurn(semaphore, gate, preempt, run)

  expect(preempt.mock.calls.length).toBe(1) // D-12: preemptou a ação antes de adquirir
  expect(run.mock.calls.length).toBe(1)
  expect(gate.isBusy('player')).toBe(false) // liberou o gate no finally
  // o semáforo voltou livre: um acquire imediato resolve sem pendurar.
  let acquired = false
  await semaphore.acquire(0).then(() => { acquired = true })
  expect(acquired).toBe(true)
  semaphore.release()
})

test('routePlayerTurn: libera gate e semáforo mesmo quando run lança (Pitfall 3)', async () => {
  const semaphore = new Semaphore(1)
  const gate = createTaskGate()
  const preempt = mock(() => {})
  const run = mock(async () => { throw new Error('boom no turno do player') })

  let threw = false
  try {
    await routePlayerTurn(semaphore, gate, preempt, run)
  } catch {
    threw = true
  }
  expect(threw).toBe(true)
  expect(gate.isBusy('player')).toBe(false)
  let acquired = false
  await semaphore.acquire(0).then(() => { acquired = true })
  expect(acquired).toBe(true)
  semaphore.release()
})

test('routePlayerTurn: gate player já ocupado → descarta o turno (não enfileira chat duplicado)', async () => {
  const semaphore = new Semaphore(1)
  const gate = createTaskGate()
  gate.tryEnter('player') // já há um turno de player em voo
  const preempt = mock(() => {})
  const run = mock(async () => {})

  await routePlayerTurn(semaphore, gate, preempt, run)

  expect(run.mock.calls.length).toBe(0) // descartado
  expect(preempt.mock.calls.length).toBe(0) // nem chegou a preemptar
})

test('routePlayerTurn: prioridade 0 (player) fura a frente da fila do semáforo', async () => {
  const semaphore = new Semaphore(1)
  const gate = createTaskGate()
  // esgota o permit: o player vai PENDURAR no acquire(0).
  await semaphore.acquire(1)

  let ran = false
  const promise = routePlayerTurn(semaphore, gate, () => {}, async () => { ran = true })
  await Promise.resolve()
  expect(ran).toBe(false) // pendurado no semáforo (permit esgotado)

  semaphore.release() // libera → o player adquire e roda
  await promise
  expect(ran).toBe(true)
})

test('shouldPreemptAction: só preempta quando há turno de player E ação em voo (D-12)', () => {
  expect(shouldPreemptAction(true, true)).toBe(true)
  expect(shouldPreemptAction(true, false)).toBe(false) // sem ação em voo, nada a preemptar
  expect(shouldPreemptAction(false, true)).toBe(false) // sem turno de player
  expect(shouldPreemptAction(false, false)).toBe(false)
})
