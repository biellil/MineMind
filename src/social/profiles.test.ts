// src/social/profiles.test.ts
// SOC-01/D-15/D-16: perfis por jogador persistidos. trust é um escalar DETERMINÍSTICO
// (só TRUST_DELTA o altera, nunca o LLM), clampado em [-1,1]. Upsert incrementa interactions.
import { test, expect, afterAll } from 'bun:test'
import { existsSync, unlinkSync } from 'node:fs'
import { openDb } from '../memory/persistence'
import { upsertPlayer, applyTrustEvent, getProfile, TRUST_DELTA } from './profiles'

const DB_PATH = './minemind.profiles.test.sqlite'

// Windows mantém o handle do SQLite/WAL por um instante após db.close(); unlink direto lança EBUSY.
// Guardamos a remoção (padrão safeCleanup do vec.smoke.test.ts).
function safeCleanup(): void {
  for (const f of [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`]) {
    if (existsSync(f)) {
      try {
        unlinkSync(f)
      } catch {
        // EBUSY no Windows: removido no próximo run.
      }
    }
  }
}

safeCleanup()
afterAll(safeCleanup)

test('upsertPlayer de username novo cria a linha (interactions=1, trust=0, first=last=now)', () => {
  const db = openDb(DB_PATH)
  const now = 1000
  upsertPlayer(db, 'steve', now, 'Steve')
  const p = getProfile(db, 'steve')
  expect(p).toBeDefined()
  expect(p!.username).toBe('steve')
  expect(p!.displayName).toBe('Steve')
  expect(p!.interactions).toBe(1)
  expect(p!.trust).toBe(0)
  expect(p!.firstSeen).toBe(now)
  expect(p!.lastSeen).toBe(now)
  db.close()
})

test('upsertPlayer do MESMO username incrementa interactions e atualiza last_seen (first_seen imutável)', () => {
  const db = openDb(DB_PATH)
  upsertPlayer(db, 'alex', 1000, 'Alex')
  upsertPlayer(db, 'alex', 2000)
  const p = getProfile(db, 'alex')
  expect(p!.interactions).toBe(2)
  expect(p!.firstSeen).toBe(1000)
  expect(p!.lastSeen).toBe(2000)
  expect(p!.displayName).toBe('Alex') // COALESCE preserva o display_name original quando o upsert não traz um
  db.close()
})

test('applyTrustEvent move trust por deltas determinísticos de TRUST_DELTA', () => {
  const db = openDb(DB_PATH)
  upsertPlayer(db, 'notch', 1000)
  applyTrustEvent(db, 'notch', 'gaveItem') // +0.20
  expect(getProfile(db, 'notch')!.trust).toBeCloseTo(0.2, 5)
  applyTrustEvent(db, 'notch', 'attacked') // -0.40
  expect(getProfile(db, 'notch')!.trust).toBeCloseTo(-0.2, 5)
  db.close()
})

test('trust é clampado em [-1, 1] mesmo com muitos eventos no mesmo sentido', () => {
  const db = openDb(DB_PATH)
  upsertPlayer(db, 'griefer', 1000)
  for (let i = 0; i < 10; i++) applyTrustEvent(db, 'griefer', 'attacked') // -0.40 cada → saturaria em -4
  expect(getProfile(db, 'griefer')!.trust).toBe(-1)

  upsertPlayer(db, 'hero', 1000)
  for (let i = 0; i < 10; i++) applyTrustEvent(db, 'hero', 'gaveItem') // +0.20 cada → saturaria em +2
  expect(getProfile(db, 'hero')!.trust).toBe(1)
  db.close()
})

test('getProfile retorna undefined para jogador ausente', () => {
  const db = openDb(DB_PATH)
  expect(getProfile(db, 'fantasma')).toBeUndefined()
  db.close()
})

test('TRUST_DELTA expõe os kinds determinísticos esperados (D-15)', () => {
  expect(TRUST_DELTA.gaveItem).toBe(0.2)
  expect(TRUST_DELTA.helped).toBe(0.1)
  expect(TRUST_DELTA.attacked).toBe(-0.4)
  expect(TRUST_DELTA.stole).toBe(-0.3)
  expect(TRUST_DELTA.interaction).toBe(0.01)
})
