// src/control/disposition.test.ts
// D-05: testes do parser literal de disposição (!ajudante/!sozinho) — SEM LLM.
// Garante o ISOLAMENTO controle <-> disposição: nenhum termo de um vaza para o outro.
import { test, expect } from 'bun:test'
import { parseDisposition, DISPOSITION_COMMANDS } from './disposition'
import { parseCommand } from './commands'

test('parseDisposition mapeia cada keyword literal de disposição', () => {
  expect(parseDisposition('!ajudante')).toBe('ASSISTANT')
  expect(parseDisposition('!sozinho')).toBe('AUTONOMOUS')
})

test('parseDisposition normaliza case e espaços', () => {
  expect(parseDisposition('  !AJUDANTE ')).toBe('ASSISTANT')
  expect(parseDisposition('!Sozinho')).toBe('AUTONOMOUS')
})

test('parseDisposition de texto não reconhecido retorna null (no-op)', () => {
  expect(parseDisposition('oi tudo bem?')).toBeNull()
  expect(parseDisposition('')).toBeNull()
  expect(parseDisposition('ajudante')).toBeNull() // sem o '!'
})

test('parseDisposition não cai em props herdadas (hasOwnProperty)', () => {
  expect(parseDisposition('toString')).toBeNull()
  expect(parseDisposition('constructor')).toBeNull()
  expect(parseDisposition('__proto__')).toBeNull()
})

test('isolamento: comando de controle NÃO é disposição', () => {
  // !pausar/!auto/!livre são controle — parseDisposition deve ignorá-los
  expect(parseDisposition('!pausar')).toBeNull()
  expect(parseDisposition('!auto')).toBeNull()
  expect(parseDisposition('!livre')).toBeNull()
})

test('isolamento: comando de disposição NÃO é controle', () => {
  // !ajudante/!sozinho são disposição — parseCommand deve ignorá-los
  expect(parseCommand('!ajudante')).toBeNull()
  expect(parseCommand('!sozinho')).toBeNull()
})

test('DISPOSITION_COMMANDS é imutável (Object.freeze)', () => {
  expect(Object.isFrozen(DISPOSITION_COMMANDS)).toBe(true)
})
