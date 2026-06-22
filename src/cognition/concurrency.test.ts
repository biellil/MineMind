// src/cognition/concurrency.test.ts
// 10.1-01 / D-01/D-02/D-03/D-11: primitivas de concorrência zero-dep — Semaphore (acquire por
// prioridade com fila ordenada + FIFO no desempate; release passa permit direto) e createTaskGate
// (3 flags independentes por tipo). Sem rede, sem mock — só lógica pura.
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
  sem.acquire(1).then(() => { first = true })
  sem.acquire(1).then(() => { second = true })
  await drain()
  expect(first).toBe(true) // permit livre → resolve imediato
  expect(second).toBe(false) // permits esgotados → pendente
  sem.release()
  await drain()
  expect(second).toBe(true) // o release passou o permit ao waiter
})

test('Semaphore(2): dois acquire resolvem SEM release intermediário (sobreposição real, D-03)', async () => {
  const sem = new Semaphore(2)
  let a = false
  let b = false
  sem.acquire(1).then(() => { a = true })
  sem.acquire(1).then(() => { b = true })
  await drain()
  expect(a).toBe(true)
  expect(b).toBe(true) // permits=2 → os dois cabem sem release
})

test('prioridade: player(0) enfileirado DEPOIS de reflection(2) resolve ANTES no próximo release (D-11)', async () => {
  const sem = new Semaphore(1)
  await sem.acquire(1) // esgota o único permit
  const order: string[] = []
  sem.acquire(2).then(() => order.push('reflection')) // entra primeiro, prioridade pior
  sem.acquire(0).then(() => order.push('player')) // entra depois, prioridade melhor → fura a frente
  await drain()
  sem.release()
  await drain()
  expect(order[0]).toBe('player') // menor número de prioridade sai primeiro
})

test('estabilidade FIFO: dois waiters de MESMA prioridade resolvem na ordem de chegada', async () => {
  const sem = new Semaphore(1)
  await sem.acquire(1) // esgota o permit
  const order: string[] = []
  sem.acquire(1).then(() => order.push('first'))
  sem.acquire(1).then(() => order.push('second'))
  await drain()
  sem.release()
  sem.release()
  await drain()
  expect(order).toEqual(['first', 'second']) // só insere antes de prioridade ESTRITAMENTE maior → FIFO
})

test('permits guard: Semaphore(0) é normalizado para >= 1 (Math.max(1, permits))', async () => {
  const sem = new Semaphore(0)
  let resolved = false
  sem.acquire(1).then(() => { resolved = true })
  await drain()
  expect(resolved).toBe(true) // 0 vira 1 → o primeiro acquire ainda resolve
})

test('release() sem waiter incrementa permits; com waiter passa o permit direto (não incrementa)', async () => {
  const sem = new Semaphore(1)
  await sem.acquire(1) // permits = 0
  sem.release() // sem waiter → permits volta a 1
  let resolved = false
  sem.acquire(1).then(() => { resolved = true })
  await drain()
  expect(resolved).toBe(true) // o permit reposto foi consumido pelo novo acquire

  // agora com waiter: esgota e enfileira; o release deve passar direto (não acumular permit)
  await sem.acquire(1) // permits = 0
  let waiter = false
  sem.acquire(1).then(() => { waiter = true })
  await drain()
  sem.release() // há waiter → resolve direto, permits permanece 0
  await drain()
  expect(waiter).toBe(true)
  // o permit foi consumido pelo waiter; um novo acquire deve ficar pendente
  let extra = false
  sem.acquire(1).then(() => { extra = true })
  await drain()
  expect(extra).toBe(false)
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
