---
phase: 04-persist-ncia-reflex-o-e-identidade-viva
plan: 01
subsystem: database
tags: [sqlite-vec, bun:sqlite, vec0, embeddings, float32array, windows]

# Dependency graph
requires:
  - phase: 03
    provides: loop cognitivo + memória de curto prazo (shortTerm.ts) — fonte futura da consolidação CP→LP
provides:
  - "sqlite-vec@0.1.9 instalado com binário Windows (vec0.dll) resolvido"
  - "Prova de que sqliteVec.load(db) funciona em bun:sqlite no Windows sem setCustomSQLite"
  - "Prova de que Float32Array direto faz round-trip por vec0 (INSERT + KNN MATCH) — sem necessidade de Buffer.from"
  - "Técnica de bind confirmada para o Plan 03 (longTerm.ts) herdar"
affects: [04-02, 04-03, longTerm.ts, persistence.ts, embeddings.ts]

# Tech tracking
tech-stack:
  added: [sqlite-vec@0.1.9]
  patterns:
    - "Carregar vec0 via import * as sqliteVec from 'sqlite-vec'; sqliteVec.load(db) (Windows, sem setCustomSQLite)"
    - "Bind de embedding como Float32Array direto no INSERT e no MATCH (não number[], não Buffer.from)"
    - "DB em arquivo (não :memory:) para vec0; PRAGMA journal_mode=WAL"

key-files:
  created: [src/memory/vec.smoke.test.ts]
  modified: [package.json, bun.lock, .gitignore]

key-decisions:
  - "D-01 de-riscada e CONFIRMADA: sqlite-vec roda em Bun/Windows — fallback vectra NÃO é necessário"
  - "Bind de Float32Array direto funciona em bun:sqlite — Plan 03 usa Float32Array, sem Buffer.from(f32.buffer)"

patterns-established:
  - "Smoke de extensão nativa em Wave 0 antes de construir pipeline (de-risk de incerteza alta)"
  - "Artefatos *.test.sqlite ignorados no git (Windows mantém handle/WAL com EBUSY após close)"

requirements-completed: [MEM-03]

# Metrics
duration: 3min
completed: 2026-06-19
---

# Phase 4 Plan 01: De-risk sqlite-vec em Bun/Windows Summary

**sqlite-vec@0.1.9 carrega no bun:sqlite no Windows e um embedding Float32Array faz round-trip por uma tabela virtual vec0 (INSERT + KNN MATCH) — D-01 confirmada, fallback vectra descartado.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-06-19T18:32:05Z
- **Completed:** 2026-06-19T18:34:35Z
- **Tasks:** 1
- **Files modified:** 4 (1 criado, 3 modificados)

## Accomplishments

- **D-01 de-riscada (item de maior incerteza da fase):** `sqliteVec.load(db)` carrega o binário nativo Windows (`vec0.dll`) em `bun:sqlite` sem nenhuma config extra (sem `setCustomSQLite`, que é macOS-only). `vec_version()` retorna string válida.
- **Open Question 2 resolvida:** o bind de `Float32Array` **direto** (sem `Buffer.from(f32.buffer)`) funciona tanto no INSERT quanto no `WHERE embedding MATCH ?`. O KNN retorna o vetor correto mais próximo primeiro.
- **Open Question 1 (binário Windows) resolvida:** `sqlite-vec-windows-x64@0.1.9` resolveu como optionalDependency e o `vec0.dll` está presente em `node_modules/sqlite-vec-windows-x64/`.
- **Fallback `vectra` descartado:** não há necessidade de cair para o vector store JS puro; a fase pode usar o store único transacional (relacional + vetorial) de D-01.

## Task Commits

1. **Task 1: Instalar sqlite-vec e provar load + round-trip vetorial** - `57a9290` (test)

**Plan metadata:** (final docs commit)

## Files Created/Modified

- `src/memory/vec.smoke.test.ts` - Smoke de Wave 0: prova `sqliteVec.load`, `vec_version()` e round-trip `Float32Array` (INSERT + KNN MATCH) por `vec0`.
- `package.json` - Adicionada dependência `sqlite-vec@0.1.9`.
- `bun.lock` - Lockfile atualizado (sqlite-vec + sqlite-vec-windows-x64).
- `.gitignore` - Ignora artefatos `*.test.sqlite`/`-wal`/`-shm` (EBUSY no Windows com WAL).

## Decisions Made

- **Bind = `Float32Array` direto.** O smoke provou que `bun:sqlite` aceita `Float32Array` no bind de `vec0` sem conversão para `Buffer`. **O Plan 03 (`longTerm.ts`) deve usar `new Float32Array(embedding)` diretamente** — NÃO usar `Buffer.from(f32.buffer)`. O fallback de Pitfall 3 NÃO foi acionado.
- **DB em arquivo, não `:memory:`.** Conforme RESEARCH Pattern 1; `vec0` não é confiável em `:memory:` em todos os builds.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Cleanup do `afterAll` lançava EBUSY no Windows**
- **Found during:** Task 1 (primeira execução do smoke)
- **Issue:** Os 2 testes (load + round-trip) passaram, mas o `afterAll` do plano fazia `unlinkSync` direto e lançava `EBUSY: resource busy or locked` — o Windows mantém o handle do arquivo SQLite/WAL por um instante após `db.close()`, fazendo o run sair com código 1 apesar do de-risk ter sucedido.
- **Fix:** Envolvi a remoção numa função `safeCleanup()` com `try/catch` por arquivo (engole EBUSY) e a chamei TAMBÉM antes do primeiro teste (garante DB fresco entre runs). Adicionei `*.test.sqlite*` ao `.gitignore` para nunca commitar os artefatos travados.
- **Files modified:** src/memory/vec.smoke.test.ts, .gitignore
- **Verification:** `bun test src/memory/vec.smoke.test.ts` → 2 pass / 0 fail; `bun run typecheck` exit 0.
- **Committed in:** `57a9290` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — cleanup do harness, não do sqlite-vec)
**Impact on plan:** O de-risk em si (load + round-trip vetorial) passou na primeira tentativa. O único ajuste foi tornar a limpeza do teste resiliente ao file-locking do Windows. Sem scope creep; nenhum fallback de produto (Buffer.from ou vectra) foi necessário.

## Issues Encountered

- File-locking do Windows em arquivos SQLite com WAL após `close()` — resolvido tornando o cleanup tolerante a falha (ver Deviation 1). Nota para planos futuros que abrirem `bun:sqlite` em testes: usar a mesma estratégia de cleanup guardado.

## User Setup Required

Nenhum para ESTE plano (o smoke usa vetores sintéticos). **Porém, os planos 02+ precisam:** um modelo de embedding carregado no LM Studio (`/v1/embeddings`), com `EMBEDDING_MODEL` configurável (default sugerido `text-embedding-nomic-embed-text-v1.5`, dimensão 768). Validar a dimensão no boot (RESEARCH Pitfall 2).

## Next Phase Readiness

- **D-01 confirmada — o resto da fase pode prosseguir no caminho principal** (`bun:sqlite` + `vec0` como store único transacional). Sem necessidade de re-planejar para `vectra`.
- O Plan 03 (`longTerm.ts`) já tem a técnica de bind definida: `Float32Array` direto.
- Próximo plano da fila: 04-02.

## Self-Check: PASSED

- FOUND: src/memory/vec.smoke.test.ts
- FOUND: .planning/phases/04-persist-ncia-reflex-o-e-identidade-viva/04-01-SUMMARY.md
- FOUND: commit 57a9290
- FOUND: `sqlite-vec` em package.json

---
*Phase: 04-persist-ncia-reflex-o-e-identidade-viva*
*Completed: 2026-06-19*
