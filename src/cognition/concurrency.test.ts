// src/cognition/concurrency.test.ts
// 10.1-01 / D-01/D-02/D-03/D-11: primitivas de concorrência zero-dep — Semaphore (acquire por
// prioridade com fila ordenada + FIFO no desempate; release passa permit direto) e createTaskGate
// (3 flags independentes por tipo). Sem rede, sem mock — só lógica pura.
//
// NOTA de runtime: cada acquire() pendente é uma Promise viva; se um teste terminar com waiters
// não resolvidos, o event loop do bun fica preso e o processo não sai. Por isso TODO teste
// drena (resolve) seus waiters via release() antes de terminar (await das promises de acquire).
import { test, expect } from 'bun:test'
import { Semaphore, createTaskGate } from './concurrency'

// Drena microtasks o suficiente para que os .then dos acquires pendentes corram.
async function drain(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

test('Semaphore(1): 1º acquire resolve já; 2º fica pendente até release (single-flight, D-03)', async () => {
  const sem = new Semaphore(1)
  let first = false
  let second = false
  const p1 = sem.acquire(1).then(() => { first = true })
  const p2 = sem.acquire(1).then(() => { second = true })
  await drain()
  expect(first).toBe(true) // permit livre → resolve imediato
  expect(second).toBe(false) // permits esgotados → pendente
  sem.release()
  await Promise.all([p1, p2]) // drena os waiters
  expect(second).toBe(true) // o release passou o permit ao waiter
})

test('Semaphore(2): dois acquire resolvem SEM release intermediário (sobreposição real, D-03)', async () => {
  const sem = new Semaphore(2)
  let a = false
  let b = false
  const p1 = sem.acquire(1).then(() => { a = true })
  const p2 = sem.acquire(1).then(() => { b = true })
  await Promise.all([p1, p2]) // ambos cabem (permits=2) → resolvem sem release
  expect(a).toBe(true)
  expect(b).toBe(true)
})

test('prioridade: player(0) enfileirado DEPOIS de reflection(2) resolve ANTES no próximo release (D-11)', async () => {
  const sem = new Semaphore(1)
  await sem.acquire(1) // esgota o único permit
  const order: string[] = []
  const pr = sem.acquire(2).then(() => order.push('reflection')) // entra 1º, prioridade pior
  const pp = sem.acquire(0).then(() => order.push('player')) // entra depois, prioridade melhor → fura
  await drain()
  sem.release() // libera o player (prioridade 0)
  await drain()
  sem.release() // libera a reflection — drena o 2º waiter p/ não pendurar o teste
  await Promise.all([pr, pp])
  expect(order[0]).toBe('player') // menor número de prioridade sai primeiro
})

test('estabilidade FIFO: dois waiters de MESMA prioridade resolvem na ordem de chegada', async () => {
  const sem = new Semaphore(1)
  await sem.acquire(1) // esgota o permit
  const order: string[] = []
  const p1 = sem.acquire(1).then(() => order.push('first'))
  const p2 = sem.acquire(1).then(() => order.push('second'))
  await drain()
  sem.release()
  sem.release()
  await Promise.all([p1, p2])
  expect(order).toEqual(['first', 'second']) // só insere antes de prioridade ESTRITAMENTE maior → FIFO
})

test('permits guard: Semaphore(0) é normalizado para >= 1 (Math.max(1, permits))', async () => {
  const sem = new Semaphore(0)
  let resolved = false
  await sem.acquire(1).then(() => { resolved = true })
  expect(resolved).toBe(true) // 0 vira 1 → o primeiro acquire ainda resolve
})

test('release() sem waiter incrementa permits; com waiter passa o permit direto (não incrementa)', async () => {
  const sem = new Semaphore(1)
  await sem.acquire(1) // permits = 0
  sem.release() // sem waiter → permits volta a 1
  let resolved = false
  await sem.acquire(1).then(() => { resolved = true })
  expect(resolved).toBe(true) // o permit reposto foi consumido pelo novo acquire

  // agora com waiter: esgota e enfileira; o release deve passar direto (não acumular permit)
  // permits = 0 aqui (consumido acima)
  let waiter = false
  const pw = sem.acquire(1).then(() => { waiter = true })
  await drain()
  expect(waiter).toBe(false) // pendente (permits=0)
  sem.release() // há waiter → resolve direto, permits permanece 0
  await pw
  expect(waiter).toBe(true)

  // o permit foi consumido pelo waiter; um novo acquire deve ficar pendente
  let extra = false
  const pe = sem.acquire(1).then(() => { extra = true })
  await drain()
  expect(extra).toBe(false)
  sem.release() // drena o último waiter p/ não pendurar o teste
  await pe
  expect(extra).toBe(true)
})

test('Gate: tryEnter true na 1ª vez, false na 2ª; leave libera (mesmo tipo não sobrepõe, D-01/D-12)', () => {
  const gate = createTaskGate()
  expect(gate.tryEnter('action')).toBe(true) // entra
  expect(gate.tryEnter('action')).toBe(false) // já ocupado → não sobrepõe
  expect(gate.isBusy('action')).toBe(true)
  gate.leave('action')
  expect(gate.isBusy('action')).toBe(false)
  expect(gate.tryEnter('action')).toBe(true) // liberado → entra de novo
})

test('Gate: tipos são independentes (action não afeta reflection/player)', () => {
  const gate = createTaskGate()
  expect(gate.tryEnter('action')).toBe(true)
  expect(gate.tryEnter('reflection')).toBe(true) // tipo distinto → independente
  expect(gate.tryEnter('player')).toBe(true)
  expect(gate.isBusy('action')).toBe(true)
  expect(gate.isBusy('reflection')).toBe(true)
  expect(gate.isBusy('player')).toBe(true)
})
