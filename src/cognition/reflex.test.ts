// src/cognition/reflex.test.ts
// Tabela-verdade da arbitragem reflexa (SURV-01..05). Função PURA — sem mock de bot,
// só objetos ReflexSensors literais. Espelha o estilo de arbiter.test.ts.
import { test, expect } from 'bun:test'
import { arbitrateReflex, isHostileThreat, hostileThreatDistance } from './reflex'
import type { ReflexSensors } from './reflex'

// Estado-base totalmente saudável: nenhum reflexo deve disparar.
function sensors(over: Partial<ReflexSensors> = {}): ReflexSensors {
  return {
    food: 20,
    health: 20,
    oxygen: 20,
    isNight: false,
    nearestHostile: null,
    lavaAhead: false,
    fallAhead: 0,
    cornered: false,
    ...over,
  }
}

// --- estado saudável ---

test('estado totalmente saudável -> null (nenhum reflexo)', () => {
  expect(arbitrateReflex(sensors())).toBeNull()
})

// --- SURV-04 / D-03: ambiental (lava/oxigênio) é a MAIOR prioridade ---

test('SURV-04 lavaAhead=true -> retreatEnv lifeCritical', () => {
  expect(arbitrateReflex(sensors({ lavaAhead: true }))).toEqual({ reflex: 'retreatEnv', lifeCritical: true })
})

test('SURV-04 oxygen<=6 (afogamento) -> retreatEnv lifeCritical', () => {
  expect(arbitrateReflex(sensors({ oxygen: 6 }))).toEqual({ reflex: 'retreatEnv', lifeCritical: true })
})

test('SURV-04 oxygen=7 (acima do limiar) NÃO dispara por afogamento', () => {
  expect(arbitrateReflex(sensors({ oxygen: 7 }))).toBeNull()
})

// --- SURV-02 / D-13: distâncias graduadas por tipo de mob ---

test('SURV-02 creeper dist<=10 dispara; dist=11 não', () => {
  const creeper = (d: number) => sensors({ nearestHostile: { kind: 'Hostile mobs', name: 'creeper', distance: d } })
  expect(arbitrateReflex(creeper(10))).toEqual({ reflex: 'flee', lifeCritical: true })
  expect(arbitrateReflex(creeper(11))).toBeNull()
})

test('SURV-02 zombie (melee) dist<=8 dispara; dist=9 não', () => {
  const zombie = (d: number) => sensors({ nearestHostile: { kind: 'Hostile mobs', name: 'zombie', distance: d } })
  expect(arbitrateReflex(zombie(8))).toEqual({ reflex: 'flee', lifeCritical: true })
  expect(arbitrateReflex(zombie(9))).toBeNull()
})

test('SURV-02 skeleton (ranged) dist<=16 dispara; dist=17 não', () => {
  const skel = (d: number) => sensors({ nearestHostile: { kind: 'Hostile mobs', name: 'skeleton', distance: d } })
  expect(arbitrateReflex(skel(16))).toEqual({ reflex: 'flee', lifeCritical: true })
  expect(arbitrateReflex(skel(17))).toBeNull()
})

// --- SURV-02 / D-15 / D-16: fugir vs revidar (cornered) ---

test('SURV-02 hostil no alcance + cornered=true -> defend lifeCritical', () => {
  const s = sensors({ nearestHostile: { kind: 'Hostile mobs', name: 'zombie', distance: 5 }, cornered: true })
  expect(arbitrateReflex(s)).toEqual({ reflex: 'defend', lifeCritical: true })
})

// --- SURV-03 / D-17: abrigo NÃO dispara por anoitecer sozinho ---

test('SURV-03 isNight=true sem hostil e food ok -> null (anoitecer não é reflexo)', () => {
  expect(arbitrateReflex(sensors({ isNight: true }))).toBeNull()
})

test('SURV-03/D-17 cornered + noite + hostil -> shelter (variação do caminho hostil)', () => {
  const s = sensors({ nearestHostile: { kind: 'Hostile mobs', name: 'zombie', distance: 4 }, cornered: true, isNight: true })
  expect(arbitrateReflex(s)).toEqual({ reflex: 'shelter', lifeCritical: true })
})

// --- SURV-01 / D-02: fome NUNCA preempta ---

test('SURV-01 food<=16 sem perigo -> eat lifeCritical=false', () => {
  expect(arbitrateReflex(sensors({ food: 16 }))).toEqual({ reflex: 'eat', lifeCritical: false })
})

test('SURV-01 food=17 (acima) NÃO dispara fome', () => {
  expect(arbitrateReflex(sensors({ food: 17 }))).toBeNull()
})

test('SURV-01/D-02 fome + hostil -> o hostil (lifeCritical) vence a fome', () => {
  const s = sensors({ food: 5, nearestHostile: { kind: 'Hostile mobs', name: 'zombie', distance: 4 } })
  expect(arbitrateReflex(s)).toEqual({ reflex: 'flee', lifeCritical: true })
})

// --- SURV-04 queda / D-14 ---

test('SURV-04 fallAhead > 3 -> retreatEnv lifeCritical; <=3 não', () => {
  expect(arbitrateReflex(sensors({ fallAhead: 4 }))).toEqual({ reflex: 'retreatEnv', lifeCritical: true })
  expect(arbitrateReflex(sensors({ fallAhead: 3 }))).toBeNull()
})

// --- vida crítica sem ameaça localizada ---

test('health<=10 sem hostil/ambiental -> flee lifeCritical', () => {
  expect(arbitrateReflex(sensors({ health: 10 }))).toEqual({ reflex: 'flee', lifeCritical: true })
})

// --- SURV-05 / D-03: ordenação de gravidade (ambiental > hostil > queda > fome) ---

test('SURV-05/D-03 lava + hostil + queda + fome -> retreatEnv (ambiental vence tudo)', () => {
  const s = sensors({ lavaAhead: true, fallAhead: 6, food: 3, nearestHostile: { kind: 'Hostile mobs', name: 'creeper', distance: 2 } })
  expect(arbitrateReflex(s)).toEqual({ reflex: 'retreatEnv', lifeCritical: true })
})

test('SURV-05/D-03 sem ambiental, com hostil + queda + fome -> hostil vence', () => {
  const s = sensors({ fallAhead: 6, food: 3, nearestHostile: { kind: 'Hostile mobs', name: 'zombie', distance: 2 } })
  expect(arbitrateReflex(s)).toEqual({ reflex: 'flee', lifeCritical: true })
})

test('SURV-05/D-03 sem ambiental nem hostil, com queda + fome -> queda (retreatEnv) vence', () => {
  const s = sensors({ fallAhead: 6, food: 3 })
  expect(arbitrateReflex(s)).toEqual({ reflex: 'retreatEnv', lifeCritical: true })
})

test('SURV-05/D-03 só fome -> eat', () => {
  expect(arbitrateReflex(sensors({ food: 3 }))).toEqual({ reflex: 'eat', lifeCritical: false })
})

// --- helpers puros ---

test('hostileThreatDistance por tipo (creeper 10, skeleton 16, melee 8, não-hostil 0)', () => {
  expect(hostileThreatDistance('Hostile mobs', 'creeper')).toBe(10)
  expect(hostileThreatDistance('Hostile mobs', 'skeleton')).toBe(16)
  expect(hostileThreatDistance('Hostile mobs', 'zombie')).toBe(8)
  expect(hostileThreatDistance('Passive mobs', 'cow')).toBe(0)
})

test('isHostileThreat: dentro do alcance true, fora false, null false', () => {
  expect(isHostileThreat(sensors({ nearestHostile: { kind: 'Hostile mobs', name: 'zombie', distance: 8 } }))).toBe(true)
  expect(isHostileThreat(sensors({ nearestHostile: { kind: 'Hostile mobs', name: 'zombie', distance: 9 } }))).toBe(false)
  expect(isHostileThreat(sensors())).toBe(false)
})
