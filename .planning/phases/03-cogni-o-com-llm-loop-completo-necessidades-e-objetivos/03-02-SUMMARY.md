---
phase: 03-cogni-o-com-llm-loop-completo-necessidades-e-objetivos
plan: 02
subsystem: motivation
tags: [needs, goals, anti-starvation, hysteresis, pure-module, tdd]
requires:
  - src/perception/types.ts (WorldSnapshot — entrada de evaluateNeeds)
provides:
  - "src/motivation/types.ts: Need, NeedKind, Goal, GoalSource, MotivationConfig, SelectGoalContext, Disposition, ACTIVE_NEEDS, STUB_NEEDS"
  - "src/motivation/needs.ts: createNeeds, evaluateNeeds (híbrido), urgency (anti-starvation) — módulo PURO"
  - "src/motivation/goals.ts: generateGoals, selectGoal (histerese/preempção), advanceProgress — módulo PURO"
affects:
  - "Plan 03 (integração): lê .env, deriva MotivationConfig por disposição e pluga evaluateNeeds/generateGoals/selectGoal no analyze/decide do grafo"
tech-stack:
  added: []
  patterns:
    - "Módulo puro estilo arbiter.ts/safety.ts: tempo (now) e config por parâmetro, sem Date.now() nem config global, sem bot/LLM"
    - "Imutabilidade: evaluateNeeds/advanceProgress retornam novos objetos; clamp 0..1"
key-files:
  created:
    - src/motivation/types.ts
    - src/motivation/needs.ts
    - src/motivation/needs.test.ts
    - src/motivation/goals.ts
    - src/motivation/goals.test.ts
  modified: []
decisions:
  - "dependsOn é estrutural (sempre [] e não consultado por selectGoal) nesta fase — resolução comportamental de dependências adiada (D-16, gap conhecido)"
  - "Disposition declarada localmente em motivation/types.ts para manter Plan 02 independente do Plan 01; Plan 03 reconcilia estruturalmente com src/llm/prompts.ts"
  - "resourceTargets vazio => resources satisfeito (value 1): nada a buscar = satisfeito"
metrics:
  tasks: 2
  files: 5
  commits: 4
  tests: 28
  duration: "~10 min"
  completed: 2026-06-19
---

# Phase 3 Plan 02: Sistema de Motivação (Necessidades e Objetivos) Summary

Sistema de motivação intrínseca como módulos PUROS (estilo `arbiter.ts`/`safety.ts`): necessidades híbridas que decaem com anti-starvation monotônico (NEED-01/02) e objetivos dinâmicos com prioridade/progresso/dependências e comprometimento por histerese com preempção bem definida (GOAL-01/02). Tempo e config entram por parâmetro — zero acoplamento a bot/LLM/config global, 100% testável por TDD.

## O Que Foi Construído

- **`src/motivation/types.ts`** — contratos do domínio: `Need`/`NeedKind`, `Goal`/`GoalSource`, `MotivationConfig`, `SelectGoalContext`, `Disposition`, e as constantes `ACTIVE_NEEDS` (survival/resources/curiosity) e `STUB_NEEDS` (shelter/social, D-08).
- **`src/motivation/needs.ts`** (NEED-01/02) — `createNeeds(now)`, `evaluateNeeds(prev, snap, now, cfg)` híbrido (D-09: survival = média health/food do snapshot; resources = fração de `resourceTargets` no inventário; curiosity decai por timer; shelter/social stub inalterado) e `urgency(n, now, cfg)` com boost monotônico anti-starvation ponderado por pesos (D-10/D-11).
- **`src/motivation/goals.ts`** (GOAL-01/02) — `generateGoals(needs, now, cfg)` deriva um Goal por necessidade ativa acima de `goalThreshold` (id estável `need:<kind>`, priority = urgency, source `need`); `selectGoal(current, candidates, ctx, cfg)` com guarded execution (histerese via `hysteresisMargin`) e preempção por sobrevivência crítica ou pedido de jogador em ASSISTANT (D-15); `advanceProgress(goal, delta)` imutável com clamp 0..1.

## Como Funciona

- **Híbrido (D-09):** sobrevivência e recursos refletem o estado real do `WorldSnapshot`; curiosidade decai por tempo (`curiosityDecayPerMs`). shelter/social são stub — retornados sem alteração (espelha o stub de Fighting/Building da Fase 2).
- **Anti-starvation (NEED-02/D-11):** `urgency = weights[kind] * ((1 - value) + starvationBoostPerMs * (now - lastSatisfiedAt))` — para um value fixo, a urgência cresce estritamente com o tempo ignorado, garantindo que nenhuma necessidade fique permanentemente preterida.
- **Histerese + preempção (GOAL-02/D-15):** o objetivo atual só é trocado se o melhor candidato superar a prioridade atual pela margem de histerese — salvo dois gatilhos de reconsideração explícitos: `survivalCritical` (sempre) e `playerRequestPending` em ASSISTANT (em AUTONOMOUS o pedido é ignorado, D-13/T-03-05).
- **Pureza:** todas as funções recebem `now` e `MotivationConfig` por parâmetro. As funções são agnósticas de disposição — o Plan 03 deriva o cfg por disposição e injeta o correto.

## Decisões Tomadas

- **dependsOn estrutural (D-16):** o campo existe na struct `Goal` mas é SEMPRE `[]` nesta fase e `selectGoal` NÃO o consulta. Ver "Gaps Conhecidos".
- **Disposition local:** declarada em `motivation/types.ts` para manter o Plan 02 independente do Plan 01. Mesma string-literal union do `src/llm/prompts.ts` → compatível estruturalmente; o Plan 03 reconcilia.
- **resourceTargets vazio ⇒ resources = 1:** sem targets configurados, "nada a buscar" é tratado como satisfeito (evita divisão por zero e objetivos espúrios de recurso).

## Gaps Conhecidos

- **Resolução comportamental de dependências entre objetivos (D-16):** `dependsOn` é estrutural apenas. A lógica de só permitir um objetivo quando suas dependências estão satisfeitas fica para iteração futura — não é silencioso, está documentado aqui e no código (`goals.ts`).
- **Pesos/limiares concretos por disposição:** os valores numéricos de `weights`/`curiosityDecayPerMs`/`starvationBoostPerMs`/`goalThreshold`/`hysteresisMargin` são definidos no Plan 03 (config.ts, via `.env`). Este plano apenas consome `MotivationConfig` por parâmetro; os testes usam cfg fixo determinístico.

## Deviations from Plan

None - plan executed exactly as written. Os dois ciclos TDD (RED→GREEN) foram seguidos sem refator adicional necessário; nenhum bug, funcionalidade crítica faltante ou bloqueio surgiu.

## Verification

- `bun test src/motivation/` — 28 testes, todos verdes (RED→GREEN comprovado pelos 4 commits TDD).
- `bunx tsc --noEmit` — sem erros.
- `grep -rn "Date.now()" src/motivation/` — vazio (pureza: tempo por parâmetro).
- `grep -rn "from '../config'" src/motivation/` — vazio (config por parâmetro, não global).
- Acceptance criteria de ambas as tasks verificadas via grep (ACTIVE_NEEDS/STUB_NEEDS, snapshot read, starvationBoostPerMs, generateGoals/selectGoal, survivalCritical/playerRequestPending/hysteresisMargin, source 'need').

## Commits

- `a479dfc` ✅ test(03-02): failing needs tests (RED — types + testes)
- `846427d` ✨ feat(03-02): hybrid needs + anti-starvation (GREEN)
- `3dc3cad` ✅ test(03-02): failing goals tests (RED)
- `3435bdd` ✨ feat(03-02): dynamic goals with hysteresis + preemption (GREEN)

## Self-Check: PASSED
