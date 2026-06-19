---
phase: 06-llm-provider-factory
plan: 02
subsystem: llm
tags: [spend-cap, cost-control, sqlite, decorator, fallback-to-local]
requires:
  - "06-01: createProvider/createOpenAiProvider/createLmStudioProvider/createLocalEmbedder + LlmProvider interface"
  - "Fase 4: bun:sqlite Database handle (holder.db / openDb)"
provides:
  - "src/llm/spendStore.ts: contador persistente de chamadas/tokens por janela diária (ensureSpendTable/windowKey/incrementCall/getCallCount)"
  - "src/llm/spendCap.ts: withSpendCap decorator (hard-cap -> fallback-to-local) + SpendStore interface + sqliteSpendStore adapter"
  - "createProvider({ db?: Database | null }): caminho cloud envolto no teto de custo"
  - "config: cloudMaxCallsPerWindow/cloudWindowMs/cloudCapAction"
affects:
  - "src/cognition/loop.ts: usa createProvider({ db: holder.db }) (D-13)"
tech-stack:
  added: []
  patterns: ["decorator de LlmProvider (D-06)", "store injetável via interface (SpendStore) testável sem SQLite", "upsert atômico ON CONFLICT", "guarda truthy para estreitar Database | null"]
key-files:
  created:
    - src/llm/spendStore.ts
    - src/llm/spendStore.test.ts
    - src/llm/spendCap.ts
    - src/llm/spendCap.test.ts
  modified:
    - src/llm/provider.ts
    - src/cognition/loop.ts
    - src/config.ts
decisions:
  - "D-06/D-07/D-08: teto = chamadas/janela (hard-cap ANTES da chamada); estourou -> fallback-to-local; fallback é custo-zero e NÃO conta"
  - "D-09: contador em SQLite (janela diária UTC) para sobreviver a restart de um loop always-on"
  - "D-05: LLM_PROVIDER=local -> createProvider devolve o local direto, SEM decorator (cap seria no-op)"
  - "createProvider({ db?: Database | null }) aceita null (tipo de holder.db); guarda truthy estreita p/ Database antes de compor o cap"
  - "Ordenamento interno: Task 3 (config) aplicada antes da Task 2 (decorator) porque createProvider referencia config.cloudMaxCallsPerWindow — necessário para typecheck verde"
metrics:
  duration: ~4 min
  tasks: 3
  files: 7
  tests_added: 10
  completed: 2026-06-19
---

# Phase 6 Plan 02: Teto de Custo (Spend Cap) Summary

Hard-cap de chamadas cloud por janela diária persistido em SQLite, implementado como decorator `withSpendCap` que cai para o LM Studio local ao estourar o teto (fallback-to-local, D-08), fiado na factory `createProvider()` que o loop cognitivo usa 1x por sessão.

## What Shipped

- **`spendStore.ts`** — contador persistente por janela diária UTC (`window_key = 'YYYY-MM-DD'`). `incrementCall` faz upsert atômico (`ON CONFLICT(window_key) DO UPDATE`); `getCallCount` é a unidade do hard-cap (D-07). `tokens` somados apenas como métrica de log (não-gate). Sobrevive a restart (D-09).
- **`spendCap.ts`** — `withSpendCap(cloud, local, store, { maxCalls })`: `route()` compara `store.getCallCount(now) >= maxCalls`; `decide`/`chat` só contam quando vão à cloud, e caem para `local` sem incrementar quando no teto. `available()` reflete o provider roteado. `embed` SEMPRE delega ao `cloud` (local por composição no Plano 01) — nunca conta. `SpendStore` é uma interface injetável (testável sem SQLite); `sqliteSpendStore(db)` é o adaptador de produção.
- **`createProvider({ db?: Database | null })`** — local: devolve o provider direto (D-05 no-op de cap). cloud: envolve com `withSpendCap` se houver `db`; sem `db` desativa o cap com `console.warn` (não usa contador volátil que mascararia a brecha de crash-loop).
- **`loop.ts`** — `createProvider({ db: holder.db })` substitui `createLmStudioProvider()` (D-13), sem cast nem `?? undefined`.
- **`config.ts`** — `cloudMaxCallsPerWindow` (default 500), `cloudWindowMs`, `cloudCapAction` ('fallback-local'), com validação de range no boot.

## Must-Haves Verificadas

- Teto atingido -> próxima decide/chat NÃO chama cloud, cai para o local (spendCap.test #2/#3). ✅
- Contador sobrevive a restart (SQLite, janela diária) — spendStore.test cobre persistência/isolamento de janela. ✅
- `LLM_PROVIDER=local` -> cap é no-op (createProvider devolve o local direto). ✅
- tokens contados só como métrica de log, não como gate (D-07; gate é por chamadas). ✅

## Deviations from Plan

### Ordenamento interno (não-bug)

**Task 3 aplicada antes da Task 2.** O plano lista Task 2 (decorator + createProvider) antes da Task 3 (config envs), mas `createProvider` referencia `config.cloudMaxCallsPerWindow`. Apliquei a Task 3 primeiro para manter `bun run typecheck` verde durante a Task 2 (gate da própria Task 2). Sem mudança de escopo — apenas ordem de execução. Cada task commitada individualmente.

### Auto-fixed Issues

None — plano executado conforme escrito (fora o ordenamento acima).

## Verification

- `bun run typecheck` — sai 0 (sem erro `'null' is not assignable to ... Database | undefined`).
- `bun test src/llm/spendStore.test.ts src/llm/spendCap.test.ts src/llm/structured.test.ts` — 16 pass / 0 fail.
- `bun test src/cognition/loop.smoke.test.ts` — verde (fiação createProvider não quebrou o loop).
- greps: hard-cap (`>= cfg.maxCalls`), `cloud.embed`, assinatura `createProvider(opts?: { db?: Database | null })`, `createProvider({ db: holder.db })` em loop.ts, `createLmStudioProvider()` removido de loop.ts (count 0).

## Commits

- `9657add` ✅ test(06-02): failing test for spendStore
- `e46ca40` ✨ feat(06-02): persist call/token counter per daily window in SQLite
- `adf783d` ✨ feat(06-02): add spend-cap envs
- `9d21948` ✅ test(06-02): failing test for withSpendCap
- `0895112` ✨ feat(06-02): wire spend-cap decorator into createProvider + loop

## Notes for Downstream

- O teto é por CHAMADAS, não por tokens; `cloudWindowMs` é só métrica/futuro (o store usa dia-UTC via `windowKey`). Para janela mensal, trocar o slice em `windowKey` para `.slice(0, 7)`.
- `usage_metadata` -> `store.incrementCall(now, tokens)` foi deixado como métrica futura (tokens=0 hoje); o gate por chamadas já fecha PROV-05.

## Self-Check: PASSED

Todos os 4 arquivos criados existem em disco; todos os 5 commits de task existem no histórico.
