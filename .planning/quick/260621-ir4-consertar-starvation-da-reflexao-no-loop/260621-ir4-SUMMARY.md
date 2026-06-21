---
phase: quick
plan: 260621-ir4
subsystem: cognition
tags: [reflection, deliberation, single-flight, starvation, driver-loop]
requires:
  - src/cognition/reflection.ts (shouldReflect)
  - src/cognition/deliberation.ts (maybeDeliberate single-flight, inalterado)
provides:
  - pickDispatch (helper puro — decide reflect|action|none por tick)
  - driver reordenado (reflect tem prioridade quando devido e lock livre)
affects:
  - src/cognition/loop.ts (driver do loop cognitivo)
tech-stack:
  added: []
  patterns:
    - "Dispatch mutuamente exclusivo por tick (reflect OU action, nunca ambas) preservando single-flight D-12"
key-files:
  created:
    - src/cognition/loop.reflect-priority.test.ts
  modified:
    - src/cognition/loop.ts
decisions:
  - "pickDispatch é função PURA exportada — torna a decisão de dispatch testável sem mockar o bot/grafo"
  - "Acúmulo de importância movido para ANTES do dispatch — shouldReflect precisa do valor atualizado no mesmo tick"
  - "deliberation.ts NÃO tocado — o lock single-flight estava correto; o bug era a ORDEM no driver"
requirements: [REFL-01, D-10, D-12]
metrics:
  duration: ~3 min
  completed: 2026-06-21
---

# Quick Task 260621-ir4: Consertar Starvation da Reflexão no Loop Summary

Reordenação do driver do loop cognitivo com um helper puro `pickDispatch` que dá prioridade à reflexão, eliminando a starvation onde a deliberação de AÇÃO roubava o lock single-flight sincronamente todo tick e a reflexão nunca rodava em produção.

## What Was Done

### Task 1: pickDispatch puro + reordenação do driver (`src/cognition/loop.ts`)
- Adicionado o helper puro exportado `pickDispatch({ inFlight, reflectDue }): 'reflect' | 'action' | 'none'` ao lado de `pickTrigger`. Regra: `inFlight → 'none'` (D-12); senão `reflectDue → 'reflect'` (prioridade D-10), caso contrário `'action'`.
- Reordenado o bloco `if (lastSnapshot)` do driver. Nova ordem:
  1. Acumular a importância dos eventos novos (movido para ANTES de qualquer dispatch — `shouldReflect` precisa do `importanceAccum` atualizado no mesmo tick).
  2. Ler `enteredIdle` do sinal real do grafo (preservado).
  3. Computar `reflectDue` via `shouldReflect` (mesmos args).
  4. `pickDispatch({ inFlight: deliberator.state.inFlight, reflectDue })` decide o ÚNICO dispatch.
  5. Despachar reflect OU action (nunca ambas) ou no-op (`'none'`).
- Preservado: a lógica B1 (`lastReflectionAt`/`importanceAccum` só rearmam com `ran === true`), o parâmetro `chroma`, e a semântica de `void`/`.then(...)` (não bloqueia o tick).

### Task 2: Teste de regressão (`src/cognition/loop.reflect-priority.test.ts`)
- 4 testes (bun:test, sem rede): prioridade do reflect, fallback de ação, single-flight (`inFlight ⇒ none`), e o cenário ao vivo (acúmulo 85 > limiar 50 ⇒ `reflect`, não `action`). O último prova a correção — falharia contra o driver antigo onde a ação tomava o lock primeiro.

## Root Cause

Todo tick, `void deliberator.maybeDeliberate(..., trigger, ...)` (AÇÃO) era a PRIMEIRA chamada e setava `state.inFlight = true` sincronamente (deliberation.ts:155). Quando o gatilho de REFLEXÃO checava `if (state.inFlight) return false` (deliberation.ts:148) no MESMO tick, sempre fazia no-op — a reflexão nunca rodava ao vivo (importância acumulada 85 vs limiar 50, 0 eventos `type='reflection'`, `[reflect]` nunca aparecia no log). A correção foi tornar ação e reflexão mutuamente exclusivas por tick, com a reflexão tendo prioridade quando devida.

## Deviations from Plan

None - plano executado exatamente como escrito.

## Verification

- `bunx tsc --noEmit -p tsconfig.json` — sem erros.
- `bun test src/cognition/loop.reflect-priority.test.ts` — 4 pass.
- `bun test src/cognition/deliberation.test.ts src/cognition/reflection.test.ts` — 23 pass (semântica do lock e da reflexão intactas).
- `bun test` (suíte completa) — 368 pass, 1 skip, 0 fail.

## Commits

- `75ed8c1` — 🐛 fix(loop): pickDispatch dá prioridade ao reflect e mata a starvation
- `87ccfc2` — ✅ test(loop): regressão da starvation da reflexão (pickDispatch)

## Known Stubs

Nenhum. Nenhum valor hardcoded/placeholder introduzido; o fix é puramente de ordenação + helper puro.

## Self-Check: PASSED

- FOUND: src/cognition/loop.reflect-priority.test.ts
- FOUND: .planning/quick/260621-ir4-consertar-starvation-da-reflexao-no-loop/260621-ir4-SUMMARY.md
- FOUND commit: 75ed8c1
- FOUND commit: 87ccfc2
