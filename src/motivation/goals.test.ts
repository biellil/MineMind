// src/motivation/goals.test.ts
// Cobre geração de objetivos a partir de necessidades (GOAL-01/D-16),
// comprometimento com histerese + preempção (GOAL-02/D-15) e advanceProgress.
// Módulo PURO — tempo e config por parâmetro.
import { test, expect } from 'bun:test'
import { generateGoals, selectGoal, advanceProgress } from './goals'
import { type Goal, type MotivationConfig, type Need, type SelectGoalContext } from './types'

const cfg: MotivationConfig = {
  weights: { survival: 1, resources: 1, curiosity: 1, shelter: 1, social: 1 },
  curiosityDecayPerMs: 0.001,
  starvationBoostPerMs: 0.0001,
  goalThreshold: 0.5,
  hysteresisMargin: 0.1,
  survivalCriticalThreshold: 0.25,
  resourceTargets: ['oak_log'],
}

function ctx(opts: Partial<SelectGoalContext> = {}): SelectGoalContext {
  return {
    survivalCritical: false,
    playerRequestPending: false,
    disposition: 'AUTONOMOUS',
    ...opts,
  }
}

function goal(id: string, priority: number, over: Partial<Goal> = {}): Goal {
  return {
    id,
    kind: id,
    priority,
    progress: 0,
    dependsOn: [],
    source: 'need',
    committedAt: 0,
    ...over,
  }
}

// --- generateGoals (GOAL-01/D-16) ---

test('generateGoals cria um Goal por necessidade ativa acima do goalThreshold', () => {
  // survival com value 0 e tempo ignorado -> urgency alta; curiosity satisfeita -> baixa
  const needs: Need[] = [
    { kind: 'survival', value: 0, lastSatisfiedAt: 0 },
    { kind: 'curiosity', value: 1, lastSatisfiedAt: 1000 },
    { kind: 'resources', value: 1, lastSatisfiedAt: 1000 },
  ]
  const goals = generateGoals(needs, 1000, cfg)
  expect(goals.map((g) => g.kind)).toContain('survival')
  expect(goals.find((g) => g.kind === 'curiosity')).toBeUndefined()
})

test('generateGoals: Goal tem source need, progress 0, dependsOn [] e priority = urgency', () => {
  const needs: Need[] = [{ kind: 'survival', value: 0, lastSatisfiedAt: 0 }]
  const goals = generateGoals(needs, 1000, cfg)
  const g = goals[0]!
  expect(g.source).toBe('need')
  expect(g.progress).toBe(0)
  expect(g.dependsOn).toEqual([])
  // urgency = 1 * ((1-0) + 0.0001*1000) = 1.1
  expect(g.priority).toBeCloseTo(1.1, 6)
  expect(g.committedAt).toBe(1000)
})

test('generateGoals usa id estável por kind (need:<kind>)', () => {
  const needs: Need[] = [{ kind: 'survival', value: 0, lastSatisfiedAt: 0 }]
  const goals = generateGoals(needs, 1000, cfg)
  expect(goals[0]!.id).toBe('need:survival')
})

test('generateGoals NÃO gera objetivo de needs stub (shelter/social) mesmo se passadas', () => {
  const needs: Need[] = [{ kind: 'shelter', value: 0, lastSatisfiedAt: 0 }]
  const goals = generateGoals(needs, 100000, cfg)
  expect(goals).toHaveLength(0)
})

test('generateGoals retorna vazio quando nenhuma urgency cruza o limiar', () => {
  const needs: Need[] = [{ kind: 'survival', value: 1, lastSatisfiedAt: 1000 }]
  const goals = generateGoals(needs, 1000, cfg)
  expect(goals).toHaveLength(0)
})

// --- selectGoal: histerese (GOAL-02) ---

test('histerese: sem gatilho, mantém o objetivo atual mesmo com candidato melhor por margem pequena', () => {
  const current = goal('a', 1.0)
  const candidates = [goal('b', 1.05)] // 1.05 < 1.0 + 0.1 -> não troca
  expect(selectGoal(current, candidates, ctx(), cfg)!.id).toBe('a')
})

test('histerese: troca quando candidato supera o atual pela margem', () => {
  const current = goal('a', 1.0)
  const candidates = [goal('b', 1.2)] // 1.2 >= 1.0 + 0.1 -> troca
  expect(selectGoal(current, candidates, ctx(), cfg)!.id).toBe('b')
})

test('sem current, escolhe o melhor candidato', () => {
  const candidates = [goal('a', 0.5), goal('b', 0.9), goal('c', 0.7)]
  expect(selectGoal(null, candidates, ctx(), cfg)!.id).toBe('b')
})

test('sem current e sem candidatos, retorna null', () => {
  expect(selectGoal(null, [], ctx(), cfg)).toBeNull()
})

test('current sem candidatos retorna o current (mantém)', () => {
  const current = goal('a', 1.0)
  expect(selectGoal(current, [], ctx(), cfg)!.id).toBe('a')
})

// --- selectGoal: preempção (D-15) ---

test('preempção por survivalCritical: troca para o melhor candidato ignorando histerese', () => {
  const current = goal('a', 1.0)
  const candidates = [goal('b', 1.01)] // margem pequena, mas survivalCritical preempta
  expect(selectGoal(current, candidates, ctx({ survivalCritical: true }), cfg)!.id).toBe('b')
})

test('preempção por pedido de jogador em ASSISTANT', () => {
  const current = goal('a', 1.0)
  const candidates = [goal('b', 1.01)]
  const c = ctx({ disposition: 'ASSISTANT', playerRequestPending: true })
  expect(selectGoal(current, candidates, c, cfg)!.id).toBe('b')
})

test('playerRequestPending NÃO preempta em AUTONOMOUS (histerese segura)', () => {
  const current = goal('a', 1.0)
  const candidates = [goal('b', 1.01)]
  const c = ctx({ disposition: 'AUTONOMOUS', playerRequestPending: true })
  expect(selectGoal(current, candidates, c, cfg)!.id).toBe('a')
})

// --- advanceProgress ---

test('advanceProgress soma delta e clampa em 0..1, imutável', () => {
  const g = goal('a', 1.0, { progress: 0.4 })
  const out = advanceProgress(g, 0.3)
  expect(out.progress).toBeCloseTo(0.7, 6)
  expect(g.progress).toBe(0.4) // original inalterado
  expect(out).not.toBe(g)
})

test('advanceProgress clampa acima de 1', () => {
  expect(advanceProgress(goal('a', 1, { progress: 0.9 }), 0.5).progress).toBe(1)
})

test('advanceProgress clampa abaixo de 0', () => {
  expect(advanceProgress(goal('a', 1, { progress: 0.2 }), -0.5).progress).toBe(0)
})

// --- selectGoal: filtro de dependsOn com completedIds (D-06) ---

test('selectGoal: completedIds vazio não filtra goals sem dependsOn (retrocompat)', () => {
  const candidates = [goal('a', 0.9, { dependsOn: [] }), goal('b', 0.7, { dependsOn: [] })]
  // Sem completedIds (default) — ambos os goals passam
  const result = selectGoal(null, candidates, ctx(), cfg)
  expect(result!.id).toBe('a') // melhor prioridade
})

test('selectGoal: filtra goal cujo dependsOn não está satisfeito em completedIds', () => {
  const blocked = goal('craft:oak_planks', 0.9, { dependsOn: ['gather:oak_log'] })
  const free     = goal('need:curiosity', 0.5, { dependsOn: [] })
  const completedIds = new Set<string>() // gather:oak_log NÃO está completo

  const result = selectGoal(null, [blocked, free], ctx(), cfg, completedIds)
  // craft:oak_planks está bloqueado — deve retornar need:curiosity (único desbloqueado)
  expect(result!.id).toBe('need:curiosity')
})

test('selectGoal: inclui goal cujo dependsOn está satisfeito em completedIds', () => {
  const ready  = goal('craft:oak_planks', 0.9, { dependsOn: ['gather:oak_log'] })
  const free   = goal('need:curiosity', 0.5, { dependsOn: [] })
  const completedIds = new Set<string>(['gather:oak_log']) // dep satisfeita

  const result = selectGoal(null, [ready, free], ctx(), cfg, completedIds)
  // craft:oak_planks está desbloqueado e tem maior prioridade
  expect(result!.id).toBe('craft:oak_planks')
})

test('selectGoal: sem 5º parâmetro funciona igual ao comportamento atual (backward compat)', () => {
  const current = goal('a', 1.0)
  const candidates = [goal('b', 1.2)]
  // Sem completedIds — comportamento original (não filtra nada, default new Set())
  const result = selectGoal(current, candidates, ctx(), cfg)
  expect(result!.id).toBe('b') // 1.2 >= 1.0 + 0.1 → troca normalmente
})
