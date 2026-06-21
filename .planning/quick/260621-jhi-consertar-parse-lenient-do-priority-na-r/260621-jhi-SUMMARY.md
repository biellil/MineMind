---
phase: quick-260621-jhi
plan: 01
subsystem: cognition/memory
tags: [reflection, schema, zod, chromadb, embedding]
requires:
  - ReflectionOutputSchema (src/llm/schemas.ts)
  - applyGoalUpdates (src/cognition/reflection.ts)
provides:
  - parse lenient de goalUpdates[].priority (não derruba summary)
  - clamp aritmético de priority para [0,1] na aplicação
affects:
  - src/cognition/deliberation.ts runReflection (parse não lança mais por priority fora de faixa)
  - pipeline de embedding/addVector no ChromaDB (deixa de ser bloqueado)
tech-stack:
  added: []
  patterns:
    - "validar lenient, clampar na aplicação (alinhado ao STACK: modelos locais derivam sem enforcement)"
key-files:
  created: []
  modified:
    - src/llm/schemas.ts
    - src/cognition/reflection.ts
    - src/cognition/reflection.test.ts
    - src/llm/schemas.test.ts
decisions:
  - "priority no schema = z.number().optional() sem .min/.max e sem .transform (D-16: .transform quebraria z.toJSONSchema do provider local)"
  - "faixa [0,1] garantida só em applyGoalUpdates (único lugar onde priority importa)"
metrics:
  duration: ~4 min
  completed: 2026-06-21
  tasks: 1
  files: 4
---

# Quick Task 260621-jhi: Consertar parse lenient do priority na reflexão Summary

Tornar `ReflectionOutputSchema` lenient no campo `goalUpdates[].priority` (remover `.min(0).max(1)`) e clampar a faixa `[0,1]` em `applyGoalUpdates`, destravando o pipeline de escrita do vetor no ChromaDB que o modelo local quebrava ao emitir `priority` em escala errada (10/12/8).

## Problema

O modelo local emitia `goalUpdates[].priority` fora de `[0,1]` (ex.: 10/12/8). O `.min(0).max(1)` no schema fazia `ReflectionOutputSchema.parse` lançar o objeto inteiro, o `catch` em `deliberation.ts` runReflection descartava o `summary` válido, o embedding nunca era gerado e o `addVector` no Chroma era pulado — Chroma ficava em 0 vetores apesar da reflexão disparar. Um campo irrelevante para o vetor derrubava todo o pipeline de memória semântica.

## Solução

Padrão **validar lenient, clampar na aplicação**:

1. **`src/llm/schemas.ts`** — `priority: z.number().min(0).max(1).optional()` → `priority: z.number().optional().describe(...)`. Sem `.min/.max` o parse não falha mais por faixa; o `.describe` apenas guia o modelo. Sem `.transform` para preservar `z.toJSONSchema` do provider local (D-16).
2. **`src/cognition/reflection.ts`** — no ramo `reprioritize`, `out.push({ ...g, priority: u.priority })` → `out.push({ ...g, priority: Math.max(0, Math.min(1, u.priority)) })`. A faixa `[0,1]` é garantida onde realmente importa. Guard `u.priority !== undefined` mantido (reprioritize sem priority continua no-op de prioridade).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Schema lenient no priority + clamp na aplicação (TDD) | 9ca318d | src/llm/schemas.ts, src/cognition/reflection.ts, src/cognition/reflection.test.ts, src/llm/schemas.test.ts |

## TDD

- **RED:** 3 novos testes falharam contra o código original (clamp >1 → recebeu 10; clamp <0 → recebeu -3; parse lenient → ZodError `too_big`).
- **GREEN:** após os 2 edits de produção, os 3 passaram; suíte alvo 32/32.
- **REFACTOR:** não necessário (mudança cirúrgica).

## Tests

- Novos: `applyGoalUpdates: clampa priority acima de 1 para 1`, `applyGoalUpdates: clampa priority abaixo de 0 para 0` (reflection.test.ts); `ReflectionOutputSchema: priority fora de [0,1] NÃO derruba o parse e summary sobrevive` (schemas.test.ts).
- Existente `reprioritize muda priority (com priority 0.9)` continua passando (0.9 dentro da faixa, não alterado).
- Suíte completa: **371 pass / 1 skip / 0 fail** (372 testes, 51 arquivos).
- `bunx tsc --noEmit`: limpo (exit 0).

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

All 4 modified files exist; SUMMARY.md exists; commit 9ca318d present in git log.
