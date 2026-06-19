---
phase: 04-persist-ncia-reflex-o-e-identidade-viva
plan: 02
subsystem: database
tags: [sqlite, bun:sqlite, sqlite-vec, vec0, wal, schema-versioning, graceful-recovery, embeddings, config]

# Dependency graph
requires:
  - phase: 04
    plan: 01
    provides: "sqlite-vec@0.1.9 carregado em bun:sqlite (Windows); técnica de bind Float32Array direto confirmada"
  - phase: 03
    provides: "interface LlmProvider (decide/chat/available) — embed() é adicionado a ela"
provides:
  - "openDb(path): store SQLite único (relacional + vetorial) com schema versionado por user_version, PRAGMAs WAL e recuperação graceful (D-02/D-03)"
  - "Schema das 5 tabelas: events / players / places / kv / vec_events (vec0 float[embeddingDim] cosine)"
  - "kvSet/kvGet — helpers de estado durável (substrato do holder durável do Plan 05)"
  - "LlmProvider.embed(text): vetor de embedding via fetch direto a /v1/embeddings (Pitfall 1)"
  - "Config knobs da Fase 4 (dbPath, embeddingModel, embeddingDim, retrieval/reflexão/identidade) com validação de range"
affects: [04-03, 04-04, 04-05, longTerm.ts, embeddings.ts, profiles.ts, holder-durable]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "openDb único transacional: sqliteVec.load(db) + PRAGMAs WAL + schema versionado (PRAGMA user_version)"
    - "vec_events (vec0) criada FORA da transação; DDL relacional dentro de db.transaction()"
    - "Recuperação graceful: fechar handle ANTES de renomear (.corrupt-<ts>) no Windows (evita EBUSY), cold-start único, último recurso :memory:"
    - "Embeddings via fetch direto a /v1/embeddings (sem OpenAIEmbeddings — Pitfall 1)"

key-files:
  created: [src/memory/persistence.ts, src/memory/persistence.test.ts]
  modified:
    - src/config.ts
    - src/llm/provider.ts
    - src/chat/conversation.test.ts
    - src/cognition/deliberation.test.ts
    - src/cognition/loop.phase3.smoke.test.ts
    - src/cognition/loop.smoke.test.ts
    - src/cognition/reconnect.test.ts
    - src/llm/structured.test.ts

key-decisions:
  - "vec_events criada FORA da transação (DDL relacional dentro); CREATE VIRTUAL TABLE não é confiável dentro de BEGIN em alguns builds do vec0"
  - "Recuperação graceful no Windows EXIGE db.close() antes de renameSync — handle aberto trava o arquivo (EBUSY)"
  - "Teste de corrupção em path isolado: WAL residual de outro teste recupera o arquivo-lixo e mascara a corrupção"
  - "Bind de embedding = Float32Array direto (herdado do 04-01); validação de dimensão = INSERT no vec0 (tamanho errado lança)"

patterns-established:
  - "Toda abertura de DB de produção passa por openDb (nunca new Database cru) para herdar PRAGMAs + recovery"

requirements-completed: [MEM-02, MEM-03]

# Metrics
duration: 12min
completed: 2026-06-19
---

# Phase 4 Plan 02: Camada de persistência base (SQLite único + embed) Summary

**`openDb` cria/abre um único arquivo SQLite (relacional + índice vetorial vec0) com schema versionado por `PRAGMA user_version`, WAL e recuperação graceful contra corrupção; o `LlmProvider` ganha `embed(text)` via fetch direto a `/v1/embeddings` — a fundação atômica de MEM-02/MEM-03 que todos os stores da fase consomem.**

## Performance

- **Duration:** ~12 min
- **Tasks:** 2
- **Files modified:** 10 (2 criados, 8 modificados)

## Accomplishments

- **Config da Fase 4 (Task 1):** adicionados ao `config` (com validação de range no boot) `dbPath`, `embeddingModel`, `embeddingDim`, `ltImportanceFloor`, `retrievalHalfLifeMs`, `retrievalK`, `reflectionImportanceThreshold`, `reflectionMaxIntervalMs`, `trustRequestThreshold`, `goalStaleMs`. Nenhum knob existente alterado.
- **`provider.embed()` (Task 1):** novo método na interface `LlmProvider`, implementado via `fetch` direto a `${baseURL}/embeddings` (mesma baseURL do probe `available()`), sem `OpenAIEmbeddings` nem pacote novo (Pitfall 1). Normaliza `\n→espaço` no input.
- **`persistence.ts` (Task 2):** `openDb` carrega `sqlite-vec`, aplica PRAGMAs WAL/NORMAL/foreign_keys/busy_timeout, e — se `user_version=0` — cria as 5 tabelas (`events`/`players`/`places`/`kv` numa transação; `vec_events` fora dela) e sobe `user_version=1`. Recuperação graceful (D-03) com renomeação `.corrupt-<ts>` e cold-start único. `kvSet`/`kvGet` para estado durável.
- **Suíte completa verde:** 171 pass / 0 fail (23 arquivos); `bun run typecheck` exit 0.

## Assinaturas exatas (exportadas)

```typescript
// src/memory/persistence.ts
export const EMBEDDING_DIM: number                                  // = config.embeddingDim
export function openDb(path?: string, _isRetry?: boolean): Database  // default = config.dbPath
export function kvSet(db: Database, key: string, value: string, now: number): void
export function kvGet(db: Database, key: string): string | undefined

// src/llm/provider.ts (adicionado à interface LlmProvider)
embed(text: string): Promise<number[]>
```

## Decisions Made

- **`vec_events` é criada FORA da transação.** O DDL relacional (`events`/`players`/`places`/`kv` + índices) roda dentro de `db.transaction()`; o `CREATE VIRTUAL TABLE ... USING vec0` é executado depois, fora do BEGIN, porque virtual tables não são confiáveis dentro de transação em alguns builds. `user_version=1` só é setado ao final. **Planos futuros que adicionarem migrations devem seguir essa ordem.**
- **Bind/validação de dimensão = `Float32Array` direto** (herdado do 04-01-SUMMARY). O teste prova que um `Float32Array(EMBEDDING_DIM)` insere sem erro e um de tamanho `EMBEDDING_DIM+1` lança — esse é o guard-rail de Pitfall 2 em runtime.
- **Último recurso da recuperação = `:memory:`.** Se até o cold-start em disco falhar, `openDb` devolve um DB `:memory:` (volátil) para que o loop cognitivo nunca aborte (Core Value), com persistência degradada e log.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Mocks de `LlmProvider` quebraram o typecheck ao adicionar `embed`**
- **Found during:** Task 1
- **Issue:** Adicionar `embed` à interface `LlmProvider` tornou 8 mocks de teste inválidos (TS2741 — propriedade `embed` ausente) em conversation/deliberation/loop.phase3/loop.smoke/reconnect/structured tests.
- **Fix:** Adicionado `embed: async () => []` (ou `mock(async () => [])`) a cada mock. Mudança mínima e não altera o comportamento testado.
- **Files modified:** src/chat/conversation.test.ts, src/cognition/deliberation.test.ts, src/cognition/loop.phase3.smoke.test.ts, src/cognition/loop.smoke.test.ts, src/cognition/reconnect.test.ts, src/llm/structured.test.ts
- **Committed in:** Task 1 commit

**2. [Rule 1 - Bug] `renameSync` do arquivo corrompido lançava EBUSY no Windows (handle aberto)**
- **Found during:** Task 2 (teste de recuperação graceful falhava — `.corrupt-` não era criado)
- **Issue:** No catch de `openDb`, o handle `Database` aberto sobre o arquivo corrompido ainda travava o arquivo no Windows; `renameSync` falhava com EBUSY (swallowed), então o cold-start recriava o DB mas o `.corrupt-<ts>` nunca aparecia. Confirmado via probe isolado (`rename sem close` → EBUSY; `rename após close` → OK).
- **Fix:** Capturar o handle (`let db`) e chamar `db?.close()` no catch ANTES de `renameSync`.
- **Files modified:** src/memory/persistence.ts
- **Committed in:** Task 2 commit

**3. [Rule 1 - Bug] WAL residual de teste anterior mascarava a corrupção**
- **Found during:** Task 2 (mesmo teste continuava falhando após o fix 2)
- **Issue:** O teste de corrupção reusava o `DB_PATH` dos testes anteriores. Restos de `-wal`/`-shm` (não removíveis por EBUSY no Windows) faziam o SQLite recuperar o arquivo-lixo via WAL, mascarando a corrupção — `quick_check` não acusava e nenhum `.corrupt-` era gerado.
- **Fix:** Teste de corrupção movido para um path dedicado (`minemind.persist.corrupt.test.sqlite`) sem WAL residual. Cleanup varre ambos os prefixos.
- **Files modified:** src/memory/persistence.test.ts (apenas teste; código de produção inalterado)
- **Committed in:** Task 2 commit

**Total deviations:** 3 auto-fixed (1 blocking de tipos por mudança de interface; 2 bugs de recovery/teste no Windows). O bug 2 era um defeito REAL da recuperação graceful em produção no Windows — não apenas do harness.

## Issues Encountered

- File-locking do Windows em SQLite/WAL após `close()` (já anotado no 04-01): reforçado o padrão "fechar antes de renomear/remover" tanto no código de produção (recovery) quanto no cleanup de teste.

## User Setup Required

Para os planos 03+ (embeddings reais): um modelo de embedding carregado no LM Studio servindo `/v1/embeddings`. Knobs: `EMBEDDING_MODEL` (default `text-embedding-nomic-embed-text-v1.5`) e `EMBEDDING_DIM` (default `768`). O código degrada gracioso se off, mas a relevância semântica (MEM-03) exige o modelo ligado em runtime.

## Next Phase Readiness

- **MEM-02 tem fundação atômica:** um único SQLite versionado com WAL, recovery graceful e índice vec0 dimensionado. Stores (Plan 03), perfis (Plan 04) e holder durável (Plan 05) podem persistir sobre `openDb`/`kvSet`/`kvGet`.
- **Próximo plano da fila:** 04-03.

## Self-Check: PASSED

- FOUND: src/memory/persistence.ts
- FOUND: src/memory/persistence.test.ts
- FOUND: src/config.ts (dbPath/embeddingDim/reflectionImportanceThreshold + validações)
- FOUND: src/llm/provider.ts (embed via /embeddings, sem OpenAIEmbeddings)
- FOUND: commit 29d1036 (Task 1)
- FOUND: commit Task 2 (persistence.ts)
- VERIFIED: `bun test src/memory/persistence.test.ts` → 4 pass / 0 fail
- VERIFIED: `bun test` (suíte completa) → 171 pass / 0 fail
- VERIFIED: `bun run typecheck` → exit 0

---
*Phase: 04-persist-ncia-reflex-o-e-identidade-viva*
*Completed: 2026-06-19*
