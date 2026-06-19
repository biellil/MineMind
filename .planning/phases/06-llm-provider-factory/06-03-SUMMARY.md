---
phase: 06-llm-provider-factory
plan: 03
subsystem: llm
tags: [llm, structured-output, parity, testing, zod, fallback, prov-04]
requires:
  - "src/llm/provider.ts: createProvider() + decideWithFallback (D-16) do Plano 01"
  - "src/llm/schemas.ts: ActionDecisionSchema (z.toJSONSchema target)"
  - "src/llm/structured.ts: decideAction validate->repair->fallback (D-17)"
  - "src/llm/structured.test.ts: mockProvider/VALID/FALLBACK helpers existentes"
provides:
  - "src/llm/parity.test.ts: teste schema-only (D-14) que pega o caveat zod v4 #8357 no CI sem rede"
  - "src/llm/parity.test.ts: teste live gated por RUN_LIVE_PARITY (D-15) que percorre createProvider()"
  - "src/llm/structured.test.ts: teste do fallback D-16/D-17 (sintoma type:None recuperado por repair)"
affects: []
tech-stack:
  added: []
  patterns:
    - "Gating de teste live via test.skipIf(!process.env.RUN_LIVE_PARITY) — CI custo-zero, paridade real sob demanda"
    - "Teste schema-only: z.toJSONSchema(schema).type === 'object' detecta regressão zod v4 SEM rede"
    - "Reuso do mockProvider existente para simular o sintoma type:None do caveat sem duplicar helpers"
key-files:
  created:
    - "src/llm/parity.test.ts: 2 testes (schema-only D-14 + live gated D-15)"
  modified:
    - "src/llm/structured.test.ts: +1 teste do fallback D-16/D-17 (6 -> 7 testes)"
decisions:
  - "D-14: schema-only assertion type==='object' é a guarda de CI custo-zero contra o caveat zod v4 #8357"
  - "D-15: UM teste live gated por RUN_LIVE_PARITY cobre paridade real dos dois providers; CI nunca aciona"
  - "D-16/D-17: o teste de type:None prova que validate->repair->fallback recupera nos dois providers via decideAction"
metrics:
  duration: 8
  tasks: 2
  files: 2
  completed: 2026-06-19
---

# Phase 6 Plan 03: Parity de Structured Output Summary

Paridade de structured output (PROV-04) entre LM Studio local e GPT-4.1-mini cloud garantida por três camadas: teste schema-only que pega o caveat zod v4 (#8357, sintoma `type:'None'`) no CI sem rede, teste mock que prova o fallback D-16/D-17 via repair, e um teste live gated por `RUN_LIVE_PARITY` que percorre os dois providers reais sob demanda.

## What Was Built

**Task 1 — `src/llm/parity.test.ts` (novo arquivo):**
- **Schema-only (D-14):** `z.toJSONSchema(ActionDecisionSchema)` deve ter `type === 'object'` e `properties.action` definido. A regressão do caveat zod v4 ↔ `withStructuredOutput` produz `type:'None'`/ausente; este teste sozinho a detecta no CI, sem custo de rede, antes que quebre silenciosamente um só provider (Pitfall 7).
- **Live gated (D-15):** `test.skipIf(!process.env.RUN_LIVE_PARITY)` percorre o provider efetivo do ambiente via `createProvider()` (lê `LLM_PROVIDER`) pela mesma interface `LlmProvider.decide` e faz `ActionDecisionSchema.parse()` na saída real. CI nunca seta `RUN_LIVE_PARITY`; o dev roda uma vez por provider antes de release (comando documentado no topo do arquivo).

**Task 2 — `src/llm/structured.test.ts` (+1 teste):**
- Reusa o `mockProvider`/`VALID`/`FALLBACK` existentes (sem duplicar helpers). O mock lança `"Invalid schema: type:'None' (zod v4 #8357)"` na 1ª chamada de `decide`; a repair (2ª chamada) recupera. Prova que `decideAction` (validate→repair→fallback) sobrevive ao sintoma do caveat nos dois providers (D-16/D-17) sem rede. Assertions: `result.action === 'gather'` e `calls === 2`.

## Verification Results

- `bun test src/llm/parity.test.ts` — 1 pass, 1 skip (live), 0 fail. Sem acesso de rede no caminho não-gated.
- `bun test src/llm/structured.test.ts` — 7 pass (era 6), 0 fail. Todos os testes existentes permanecem verdes (D-17 preservado).
- `bun test src/llm/parity.test.ts src/llm/structured.test.ts` — 8 pass, 1 skip, 0 fail.
- grep confirma os marcadores das decisões: `z.toJSONSchema(ActionDecisionSchema)` + `toBe('object')` (D-14), `RUN_LIVE_PARITY` + `skipIf` (D-15), `type:'None'`/`#8357` (D-16/D-17).

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- FOUND: src/llm/parity.test.ts
- FOUND: src/llm/structured.test.ts (modified, 7 tests)
- FOUND commit: 63482e0 (Task 1 — parity.test.ts)
- FOUND commit: d174739 (Task 2 — structured.test.ts D-16 fallback)
