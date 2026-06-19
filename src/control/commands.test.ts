// src/control/commands.test.ts
// D-08/D-09: testes do parser literal de chat + máquina de modo de controle (SEM LLM).
import { test, expect } from 'bun:test'
import { parseCommand, createControlState } from './commands'

test('parseCommand mapeia cada keyword literal', () => {
  expect(parseCommand('!pausar')).toBe('paused')
  expect(parseCommand('!vem')).toBe('standby')
  expect(parseCommand('!aqui')).toBe('standby')
  expect(parseCommand('!livre')).toBe('autonomous')
})

test('parseCommand(!livre) é autonomous, não standby', () => {
  expect(parseCommand('!livre')).toBe('autonomous')
  expect(parseCommand('!livre')).not.toBe('standby')
})

test('parseCommand(!auto) é autonomous (D-14 alias) e !livre coexiste', () => {
  expect(parseCommand('!auto')).toBe('autonomous')
  expect(parseCommand('!livre')).toBe('autonomous') // D-14 não quebra a Fase 2
})

test('parseCommand ignora comandos de disposição (isolamento controle<->disposição)', () => {
  expect(parseCommand('!ajudante')).toBeNull()
  expect(parseCommand('!sozinho')).toBeNull()
})

test('parseCommand normaliza case e espaços', () => {
  expect(parseCommand('  !PAUSAR ')).toBe('paused')
  expect(parseCommand('!Vem')).toBe('standby')
})

test('parseCommand de texto não reconhecido retorna null (no-op)', () => {
  expect(parseCommand('oi tudo bem?')).toBeNull()
  expect(parseCommand('texto qualquer')).toBeNull()
  expect(parseCommand('')).toBeNull()
  expect(parseCommand('pausar')).toBeNull() // sem o '!'
})

test('parseCommand não cai em props herdadas (hasOwnProperty)', () => {
  expect(parseCommand('toString')).toBeNull()
  expect(parseCommand('constructor')).toBeNull()
  expect(parseCommand('__proto__')).toBeNull()
})

test('createControlState inicia em autonomous', () => {
  const ctrl = createControlState()
  expect(ctrl.getMode()).toBe('autonomous')
})

test('createControlState aceita modo inicial e setMode/getMode funcionam', () => {
  const ctrl = createControlState('paused')
  expect(ctrl.getMode()).toBe('paused')
  ctrl.setMode('standby')
  expect(ctrl.getMode()).toBe('standby')
  ctrl.setMode('autonomous')
  expect(ctrl.getMode()).toBe('autonomous')
})
