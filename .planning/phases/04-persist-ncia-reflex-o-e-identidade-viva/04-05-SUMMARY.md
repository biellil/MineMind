---
phase: 04-persist-ncia-reflex-o-e-identidade-viva
plan: 05
subsystem: cognition-reflection
tags: [reflection, refl-01, hybrid-trigger, consolidation, cp-to-lp, goal-updates, pure-module, zod, deterministic-fallback]

# Dependency graph
requires:
  - phase: 04
    plan: 02
    provides: "openDb + schema events/vec_events (substrato da consolidação CP→LP)"
  - phase: 04
    plan: 03
    provides: "importanceOf, summarizeEvent, persistEvent (técnica de bind Float32Array + ordem de colunas replicada por consolidate)"
provides:
  - "src/cognition/reflection.ts — shouldReflect (gatilho híbrido D-10), consolidate (CP→LP atômico, mesmo sem LLM, importância forçada alta), applyGoalUpdates (keep/drop/reprioritize imutável), ReflectionState"
  - "src/llm/schemas.ts — ReflectionOutputSchema (summary + goalUpdates) + tipo ReflectionOutput"
  - "src/cognition/types.ts — estado 'reflecting' na union CognitiveState"
  - "src/cognition/states.ts — 'reflecting' no PRIORITY_ORDER (entre 'exploring' e 'idle', prioridade baixa)"
affects: [04-06, 04-07, deliberation-wiring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Gatilho híbrido OR de 3 condições (event-driven / acúmulo de importância / piso temporal) — função pura testável por parâmetro"
    - "Consolidação CP→LP grava DIRETO em events+vec_events (type='reflection', importância forçada 8) — NÃO usa persistEvent porque MemEvent não modela reflexão"
    - "Duplicação INTENCIONAL inline do pipeline de persistEvent (bind Float32Array + ordem de colunas) com comentário de sincronia — sem reabrir o Plan 04-03 fechado"
    - "applyGoalUpdates imutável com fallback no-op seguro (lista vazia / ids desconhecidos / reprioritize sem priority = inalterado)"
    - "Adição de estado ao enum não quebra cognitiveStateToAction (tem default → 'idle')"

key-files:
  created:
    - src/cognition/reflection.ts
    - src/cognition/reflection.test.ts
  modified:
    - src/cognition/types.ts
    - src/cognition/states.ts
    - src/llm/schemas.ts

key-decisions:
  - "Consolidação grava com type='reflection' e importância FORÇADA 8 (não derivada de importanceOf) — gap conhecido: MemEvent não tem variante de reflexão, então persistEvent não serve"
  - "Duplicação INTENCIONAL inline do INSERT de persistEvent (opção 'inline documentado', não helper) — Plan 04-03 é TDD fechado; reabri-lo custa mais que o ganho. Comentário marca a dependência de técnica de bind/schema compartilhada com 04-02/04-03"
  - "'reflecting' posicionado entre 'exploring' e 'idle' no PRIORITY_ORDER (D-11: prioridade baixa, sempre preemptível)"
  - "applyGoalUpdates reprioritize sem priority é no-op de prioridade (mantém o goal) em vez de erro — degradação graciosa com saída de LLM parcial"

requirements-completed: [REFL-01]

# Metrics
duration: ~6min
completed: 2026-06-19
---

# Phase 4 Plan 05: Reflexão (estado + peças puras) Summary

**REFL-01 entregue como PEÇAS puras + schema + enum: o estado `reflecting` existe no `CognitiveState` e no `PRIORITY_ORDER` (prioridade baixa, preemptível), `ReflectionOutputSchema` (Zod) restringe a saída do LLM a um resumo + deltas de objetivo, e `src/cognition/reflection.ts` implementa o gatilho híbrido (`shouldReflect`), a consolidação CP→LP atômica que roda mesmo sem LLM (`consolidate`, importância forçada alta) e a aplicação imutável dos deltas (`applyGoalUpdates`). A reflexão NÃO é um nó novo do StateGraph — o disparo via deliberação single-flight é wiring do Plan 06.**

## Performance

- **Duration:** ~6 min
- **Tasks:** 2 (Task 1 direto; Task 2 TDD RED→GREEN)
- **Files modified:** 5 (2 criados, 3 modificados)

## Accomplishments

- **Task 1 — enum + prioridade + schema:** `'reflecting'` adicionado à union `CognitiveState` (entre `'socializing'` e os stubs) e ao `PRIORITY_ORDER` entre `'exploring'` e `'idle'` (D-11, prioridade baixa, NÃO em `STUB_STATES`). `ReflectionOutputSchema` adicionado APÓS `ActionDecisionSchema` (sem tocá-lo). `cognitiveStateToAction` em deliberation.ts NÃO quebrou (tem `default` → `'idle'`, comportamento desejado para reflecting).
- **Task 2 — reflection.ts (TDD):** `shouldReflect` decide por OR de 3 condições (event-driven, acúmulo, piso temporal). `consolidate` ordena os eventos recentes por importância, pega o top-5, deriva um resumo (do LLM ou determinístico via `summarizeEvent`) e grava UM evento episódico `type='reflection'` com importância 8 em `events` + (se houver embedding) `vec_events` na MESMA transação. `applyGoalUpdates` aplica keep/drop/reprioritize imutável com fallback no-op.
- **Verde:** `bun test src/cognition/reflection.test.ts` → 15 pass / 0 fail; `bun test src/llm/schemas.test.ts` → 14 pass / 0 fail; suíte cognition → 73 pass; suíte completa → 213 pass / 0 fail; `bun run typecheck` → exit 0.

## Assinaturas exatas (exportadas — o Plan 06 importa estas)

```typescript
// src/llm/schemas.ts
export const ReflectionOutputSchema  // z.object({ summary: string<=500, goalUpdates: Array<{id, action: keep|drop|reprioritize, priority?}>.max(8).default([]) })
export type ReflectionOutput = z.infer<typeof ReflectionOutputSchema>

// src/cognition/reflection.ts
export interface ReflectionState { lastReflectionAt: number; importanceAccum: number }

export function shouldReflect(args: {
  enteredIdle: boolean; goalDoneOrFailed: boolean;
  importanceAccum: number; lastReflectionAt: number; now: number;
}): boolean

export function consolidate(
  db: Database, recent: ReadonlyArray<MemEvent>, now: number,
  embedding: number[] | null, summary?: string,
): number | null

export function applyGoalUpdates(
  goals: Goal[], updates: ReflectionOutput['goalUpdates'], _now: number,
): Goal[]
```

## Decisão concreta: como a consolidação grava em `events` (gap conhecido)

**`MemEvent` não modela uma variante de "reflexão".** `persistEvent` recebe um `MemEvent` e deriva a importância via `importanceOf` — para um evento de consolidação isso daria uma nota baixa (ou nem haveria um `type` semântico correto), abaixo do `ltImportanceFloor`/insuficiente para dominar o scoring de retrieve.

**Solução adotada (opção "inline documentado", não helper):** `consolidate` insere DIRETAMENTE em `events` + `vec_events` na mesma `db.transaction()`, com:
- `type = 'reflection'` (string nova; a coluna `events.type` é `TEXT` sem CHECK, então não há migração de schema);
- `importance = 8` FORÇADA (constante `CONSOLIDATION_IMPORTANCE`) — sobrevive ao floor e domina o scoring;
- `summary` = o resumo do LLM (se vier) OU a junção determinística de `summarizeEvent(top-5)`;
- `payload` = JSON `{ kind: 'reflection', summary, consolidatedAt, n }` (re-hidratável);
- embedding via **Float32Array direto** e a **mesma ordem de colunas** do INSERT de `persistEvent` (Plan 04-03) / do schema (Plan 04-02).

**Dependência de técnica compartilhada:** este INSERT replica DELIBERADAMENTE o pipeline de `persistEvent`. Se a forma do bind de embedding ou o conjunto/ordem de colunas mudar em `longTerm.ts`/`persistence.ts`, este INSERT precisa acompanhar. Um comentário no código de `consolidate` marca isso. Decidiu-se NÃO extrair um helper `persistConsolidation` nem reabrir o Plan 04-03 (TDD fechado) — o custo de reabrir excede o ganho para uma única duplicação documentada.

## Deviations from Plan

None — plano executado exatamente como escrito. O PLAN deixou DELIBERADAMENTE a escolha da forma de consolidação em aberto (o esboço de código continha notas de decisão para o executor resolver limpo); a resolução adotada é exatamente a recomendada na seção `<action>` da Task 2 (INSERT direto com importância forçada alta + duplicação inline documentada). Nenhuma regra do CLAUDE.md (Conventional Commits com emoji, sem assinatura Claude) foi violada.

## Known Stubs

None. As três funções têm implementação completa e testada. O DISPARO da reflexão (chamar `shouldReflect` no loop e rotear `reflecting` para a deliberação single-flight, alimentando `consolidate`/`applyGoalUpdates`) é wiring deliberadamente alocado ao Plan 06 — não é stub deste plano.

## Next Phase Readiness

- **REFL-01 pronto como peças puras + schema + enum.** O Plan 06 pode: (a) manter um `ReflectionState` no holder, chamar `shouldReflect` por tick; (b) ao entrar em `reflecting`, montar o prompt de reflexão restrito por `ReflectionOutputSchema`; (c) chamar `consolidate(db, recentEvents, now, embedding, output.summary)` e `applyGoalUpdates(goals, output.goalUpdates, now)`. Sem LLM, `consolidate` ainda promove CP→LP e `applyGoalUpdates` é no-op seguro.
- **Próximo plano da fila:** 04-06.

## Self-Check: PASSED

- FOUND: src/cognition/reflection.ts (shouldReflect, consolidate, applyGoalUpdates, ReflectionState)
- FOUND: src/cognition/reflection.test.ts (15 testes)
- FOUND: src/llm/schemas.ts contém `ReflectionOutputSchema` e `goalUpdates`
- FOUND: src/cognition/types.ts contém `'reflecting'`
- FOUND: src/cognition/states.ts PRIORITY_ORDER contém `'reflecting'` entre `'exploring'` e `'idle'`
- FOUND: commit 00885fc (feat enum+schema), 682c758 (test RED), 6ac1316 (feat reflection GREEN)
- VERIFIED: `bun test src/cognition/reflection.test.ts` → 15 pass / 0 fail
- VERIFIED: `bun test src/llm/schemas.test.ts` → 14 pass / 0 fail
- VERIFIED: `bun test` (suíte completa) → 213 pass / 0 fail
- VERIFIED: `bun run typecheck` → exit 0
- VERIFIED: reflection.ts contém `db.transaction`, `config.reflectionImportanceThreshold`, `config.reflectionMaxIntervalMs`

---
*Phase: 04-persist-ncia-reflex-o-e-identidade-viva*
*Completed: 2026-06-19*
