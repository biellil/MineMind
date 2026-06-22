// src/cognition/concurrency-wiring.test.ts
// Phase 10.1-02 / D-08/D-11/D-13 + reversão de D-12 (quick 260622-nif): fiação das primitivas no driver.
// Cobre o helper PURO extraído do loop p/ testabilidade:
//   - routePlayerTurn: o turno conversacional atravessa o gate 'player' + semáforo (prioridade 0),
//     roda `run` e libera (release/leave) no finally MESMO com throw. NÃO aborta a ação em voo
//     (reverte D-12): roda em paralelo, coordenado só pelo gate por tipo + prioridade 0 no semáforo.
import { test, expect, mock } from 'bun:test'
import { routePlayerTurn } from './loop'
import { Semaphore, createTaskGate } from './concurrency'

test('routePlayerTurn: entra no gate player, adquire/libera o semáforo', async () => {
  const semaphore = new Semaphore(1)
  const gate = createTaskGate()
  const run = mock(async () => {})

  await routePlayerTurn(semaphore, gate, run)

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
  const run = mock(async () => { throw new Error('boom no turno do player') })

  let threw = false
  try {
    await routePlayerTurn(semaphore, gate, run)
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
  const run = mock(async () => {})

  await routePlayerTurn(semaphore, gate, run)

  expect(run.mock.calls.length).toBe(0) // descartado
})

test('routePlayerTurn: prioridade 0 (player) fura a frente da fila do semáforo', async () => {
  const semaphore = new Semaphore(1)
  const gate = createTaskGate()
  // esgota o permit: o player vai PENDURAR no acquire(0).
  await semaphore.acquire(1)

  let ran = false
  const promise = routePlayerTurn(semaphore, gate, async () => { ran = true })
  await Promise.resolve()
  expect(ran).toBe(false) // pendurado no semáforo (permit esgotado)

  semaphore.release() // libera → o player adquire e roda
  await promise
  expect(ran).toBe(true)
})

test('routePlayerTurn: NÃO aborta a ação em voo (reverte D-12)', async () => {
  // A assinatura não aceita mais um callback de preempção (preemptAction removido). O turno de
  // player roda sem nenhum efeito colateral de abort — coordenado só pelo gate/semáforo. Aqui
  // documentamos a intenção: chamar com 3 args (sem abort) roda `run` e não há o que abortar.
  const semaphore = new Semaphore(1)
  const gate = createTaskGate()
  const run = mock(async () => {})

  await routePlayerTurn(semaphore, gate, run)

  expect(run.mock.calls.length).toBe(1)
  expect(routePlayerTurn.length).toBe(3) // (semaphore, gate, run) — sem o parâmetro de preempção
})
