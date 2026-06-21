---
type: quick
slug: 260621-lj3
title: Aposentar de vez a vec_events e a dependência sqlite-vec
subsystem: database
tags: [sqlite, bun-sqlite, sqlite-vec, chromadb, persistence, dead-code]

provides:
  - "openDb sem sqlite-vec: boot relacional puro, sem carregar o módulo vec0"
  - "Cold start não cria mais a virtual table vec_events"
  - "package.json/bun.lock sem a dependência sqlite-vec"
  - "Testes alinhados (sem asserts de vec_events; vec.smoke.test.ts removido)"
affects: [persistence, memory, chromaClient, longTerm, reflection]

tech-stack:
  removed: [sqlite-vec]
  patterns: ["Memória vetorial isolada no ChromaDB; SQLite só relacional (vec_events órfã deixada inerte em DBs antigos)"]

key-files:
  modified:
    - src/memory/persistence.ts
    - src/memory/persistence.test.ts
    - src/memory/longTerm.test.ts
    - src/cognition/reflection.test.ts
    - test/db.ts
    - package.json
    - bun.lock
  deleted:
    - src/memory/vec.smoke.test.ts

key-decisions:
  - "Opção (b): parar de criar a vec_events em DBs novos e deixar a órfã existente INTOCADA — sem bump de SCHEMA_VERSION nem DROP (a órfã é comprovadamente inerte; DROP exigiria recarregar o sqlite-vec, contradizendo o objetivo)"

requirements-completed: []

duration: 4min
completed: 2026-06-21
---

# Quick 260621-lj3: Aposentar vec_events e dependência sqlite-vec Summary

**Remoção da dívida da Fase 08.1: `openDb` deixa de carregar o `sqlite-vec` e de criar a virtual table `vec_events`; a dependência sai do package.json/bun.lock — SQLite vira só relacional, memória vetorial fica 100% no ChromaDB.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-21T18:34:12Z
- **Completed:** 2026-06-21T18:38:05Z
- **Tasks:** 3
- **Files modified:** 7 (1 deletado)

## Accomplishments
- `persistence.ts`: removido `import * as sqliteVec`, a função `vecDdl()`, a chamada `db.run(vecDdl())` e os dois `sqliteVec.load()` (caminho normal + retry em memória). `openDb` abre o DB relacional sem o módulo vec0.
- `EMBEDDING_DIM` preservado (ainda consumido por `chromaClient.ts` e `longTerm.ts`); `SCHEMA_VERSION` mantido em 2, migração 1→2 (places.type, lessons, idx_places_xz) intacta — sem bump, sem DROP.
- Testes alinhados ao novo estado: cold start espera 5 tabelas relacionais (events/players/places/kv/lessons, sem vec_events); removidos os asserts `COUNT(*) FROM vec_events`; `vec.smoke.test.ts` deletado; `test/db.ts` abre sem sqlite-vec.
- `sqlite-vec` removido de `package.json` e `bun.lock` (`bun install`: 1 package removed).

## Task Commits

Cada task foi commitada atomicamente:

1. **Task 1: Remover sqlite-vec e vec_events de persistence.ts** — `7c9d246` (🔥 remove)
2. **Task 2: Ajustar/remover testes que afirmam a vec_events** — `dff935a` (✅ test)
3. **Task 3: Remover a dependência sqlite-vec e validar a suíte** — `541cd16` (🔥 remove)

## Files Created/Modified
- `src/memory/persistence.ts` — `openDb` sem `sqliteVec.load`; sem `vecDdl()`/`db.run(vecDdl())`; comentários atualizados (memória vetorial no ChromaDB, vec_events aposentada/inerte)
- `src/memory/persistence.test.ts` — cold start espera 5 tabelas relacionais (sem vec_events, com lessons); removido o teste de dimensão do vec0 e o import não usado de `EMBEDDING_DIM`
- `src/memory/longTerm.test.ts` — removido o assert `COUNT(*) FROM vec_events` (mantida a asserção de `events`)
- `src/cognition/reflection.test.ts` — removidos os dois asserts `COUNT(*) FROM vec_events`
- `test/db.ts` — abre sem `sqlite-vec`; `vec_events` fora da lista de tabelas
- `src/memory/vec.smoke.test.ts` — **deletado** (de-risk Wave 0 do sqlite-vec sem propósito)
- `package.json` / `bun.lock` — `sqlite-vec` removido

## Decisions Made
- **Órfã intocada (opção b):** parar de criar a `vec_events` em DBs novos e deixar a tabela órfã existente em `minemind.sqlite` intacta. Sem bump de `SCHEMA_VERSION`, sem migração de DROP. Validado empiricamente no plano: DB com vec0 órfã abre sem o módulo (`quick_check=ok`, leitura/escrita relacional OK); `DROP TABLE` sem o módulo falha (`no such module: vec0`) e `PRAGMA writable_schema` é bloqueado no bun:sqlite — limpar a órfã exigiria recarregar o sqlite-vec, contradizendo o objetivo. Como a órfã é inofensiva, deixá-la é a escolha correta.

## Deviations from Plan

None - plan executed exactly as written.

(Escopo respeitado: havia modificações pré-existentes não relacionadas em `.env.example` e `src/config.ts` no working tree — NÃO foram tocadas nem commitadas nesta quick task.)

## Issues Encountered
- O sanity opcional `bun run test/db.ts` criou um `minemind.sqlite` vazio (db.ts abre o DB cru, sem schema) porque o DB real com dados não está no working dir do repo. O ponto crítico foi confirmado: o script abre o DB **sem** o `sqlite-vec` e não lança erro de módulo. Artefato vazio removido após o teste.

## Verification
- `bunx tsc --noEmit` — limpo (exit 0).
- `bun test` — 377 pass / 1 skip / 0 fail em 51 arquivos (baseline 380; queda de 3 = vec.smoke + asserts de vec_events removidos, sem nenhuma regressão).
- `rg "sqlite-vec"` em `package.json`/`bun.lock` — sem matches.
- `rg "vec_events|vec0|sqlite-vec"` em `src`/`test` — só doc histórica em comentários; nenhuma referência de código viva.

## Self-Check: PASSED

- `src/memory/vec.smoke.test.ts` — corretamente ausente (deletado)
- Commits `7c9d246`, `dff935a`, `541cd16` — todos presentes no histórico
- `sqlite-vec` ausente de `package.json` e `bun.lock`

---
*Quick task: 260621-lj3*
*Completed: 2026-06-21*
