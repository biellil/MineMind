// src/memory/lessons.test.ts
// D-19/D-20: prova os helpers de lições (storage + reforço/decay aritmético + consulta):
//  (a) insert→topLessons retorna a lição
//  (b) reinforce sobe confidence + incrementa reinforce_count (cap em 1.0)
//  (c) contradict desce confidence (piso 0.0) + incrementa contradict_count
//  (d) decay baixa confidence
//  (e) topLessons exclui lições abaixo de REMOVAL_THRESHOLD
import { test, expect } from 'bun:test'
import type { Database } from 'bun:sqlite'
import { openDb } from './persistence'
import type { LessonRow } from './persistence'
import { insertLesson, reinforceLesson, contradictLesson, decayLessons, topLessons } from './lessons'

function memDb(): Database {
  return openDb(':memory:')
}

function getLesson(db: Database, id: number): LessonRow {
  return db.prepare('SELECT * FROM lessons WHERE id = ?').get(id) as LessonRow
}

test('(a) insert → topLessons retorna a lição', () => {
  const db = memDb()
  const id = insertLesson(db, 'evitar lava à noite', 1000)
  expect(id).not.toBeNull()
  const top = topLessons(db, 5)
  expect(top.length).toBe(1)
  expect(top[0]!.text).toBe('evitar lava à noite')
  expect(top[0]!.confidence).toBe(0.5)
  db.close()
})

test('(b) reinforce sobe confidence, incrementa reinforce_count, cap em 1.0', () => {
  const db = memDb()
  const id = insertLesson(db, 'comer quando com fome', 1000, 0.5)!
  reinforceLesson(db, id, 2000)
  let l = getLesson(db, id)
  expect(l.confidence).toBeCloseTo(0.6, 5)
  expect(l.reinforce_count).toBe(1)
  expect(l.last_seen).toBe(2000)
  // muitos reforços → cap em 1.0
  for (let i = 0; i < 20; i++) reinforceLesson(db, id, 3000)
  l = getLesson(db, id)
  expect(l.confidence).toBe(1.0)
  db.close()
})

test('(c) contradict desce confidence (piso 0.0), incrementa contradict_count', () => {
  const db = memDb()
  const id = insertLesson(db, 'pular em ravinas é seguro', 1000, 0.5)!
  contradictLesson(db, id, 2000)
  let l = getLesson(db, id)
  expect(l.confidence).toBeCloseTo(0.3, 5)
  expect(l.contradict_count).toBe(1)
  // muitas contradições → piso 0.0
  for (let i = 0; i < 20; i++) contradictLesson(db, id, 3000)
  l = getLesson(db, id)
  expect(l.confidence).toBe(0.0)
  db.close()
})

test('(d) decay baixa confidence (piso 0.0)', () => {
  const db = memDb()
  const id = insertLesson(db, 'minerar reto pra baixo é arriscado', 1000, 0.5)!
  decayLessons(db)
  const l = getLesson(db, id)
  expect(l.confidence).toBeCloseTo(0.48, 5)
  db.close()
})

test('(e) topLessons exclui lições abaixo de REMOVAL_THRESHOLD e ordena por confiança desc', () => {
  const db = memDb()
  const baixa = insertLesson(db, 'lição fraca', 1000, 0.05)! // < REMOVAL_THRESHOLD (0.1)
  insertLesson(db, 'lição média', 1000, 0.4)
  insertLesson(db, 'lição forte', 1000, 0.9)
  const top = topLessons(db, 10)
  expect(top.length).toBe(2) // a 'lição fraca' é filtrada
  expect(top.some((l) => l.id === baixa)).toBe(false)
  expect(top[0]!.text).toBe('lição forte') // ORDER BY confidence DESC
  expect(top[1]!.text).toBe('lição média')
  db.close()
})
