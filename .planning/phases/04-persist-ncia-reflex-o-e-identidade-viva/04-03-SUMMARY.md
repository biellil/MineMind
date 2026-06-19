---
phase: 04-persist-ncia-reflex-o-e-identidade-viva
plan: 03
subsystem: memory
tags: [long-term-memory, generative-agents, scoring, knn, sqlite-vec, embeddings, importance-heuristic, retrieval]

# Dependency graph
requires:
  - phase: 04
    plan: 02
    provides: "openDb (store SQLite único relacional + vec0), EMBEDDING_DIM, schema events/vec_events"
  - phase: 03
    provides: "MemEvent (taxonomia de eventos) + LlmProvider.embed (consumido pelo caller, não por longTerm diretamente)"
provides:
  - "importanceOf(e): nota heurística determinística 1-10 por tipo de MemEvent (switch exaustivo, D-06)"
  - "summarizeEvent(e): texto NL canônico a embeddar (não JSON cru)"
  - "persistEvent(db, e, embedding, now, player?): escrita atômica evento+vetor na mesma transação, respeitando o piso de importância — retorna id ou null"
  - "retrieve(db, queryEmbedding, now, opts?): KNN + scoring Generative Agents (recência × importância × relevância, min-max [0,1], pesos iguais α=1), renova last_access, fallback gracioso sem embedding"
  - "recencyRaw / minMaxNormalizer / W_RECENCY/W_IMPORTANCE/W_RELEVANCE (primitivas de scoring reutilizáveis)"
  - "RetrievedEvent { id, summary, payload, importance, score }"
affects: [04-04, 04-05, reflection, profiles, holder-durable]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Escrita atômica via db.transaction(): INSERT events + INSERT vec_events (mesmo rowid) ou nada"
    - "Gate de importância (config.ltImportanceFloor) ANTES da transação — descarta ticks triviais (Pitfall 6)"
    - "Scoring Generative Agents: min-max normaliza CADA fator sobre os candidatos, soma com pesos α=1"
    - "Filtro por player via JOIN (e.player = ?), não via metadata WHERE do vec0 — mais simples de raciocinar no MVP"
    - "retrieve nunca lança: try/catch degrada para [] (Environment Availability / Core Value)"
    - "Bind de embedding = Float32Array direto (D-01, herdado do 04-01/04-02)"

key-files:
  created: [src/memory/longTerm.ts, src/memory/longTerm.test.ts]
  modified: []

key-decisions:
  - "Filtro por player implementado via JOIN relacional (e.player = ?) em ambos os caminhos (KNN e fallback), NÃO via metadata WHERE do vec0 — mais legível e suficiente para o MVP (RESEARCH Alternativas Considered linha 94)"
  - "relevance = clamp(1 - distance, [0,1]); no fallback sem embedding relevance = 0 para todos (min-max colapsa esse fator a 0 — só recência×importância decidem)"
  - "last_access é setado para `now` no INSERT (não para e.timestamp) — recência da retrieve mede desde o último acesso, e o evento recém-persistido conta como acessado agora"
  - "persistEvent ainda persiste o evento em `events` mesmo sem embedding válido (degradação graciosa LLM off); só o INSERT em vec_events é condicional a embedding && length === EMBEDDING_DIM"

requirements-completed: [MEM-02, MEM-03]

# Metrics
duration: 8min
completed: 2026-06-19
---

# Phase 4 Plan 03: Store de eventos de longo prazo (importância + scoring Generative Agents) Summary

**`src/memory/longTerm.ts` implementa o coração de MEM-03: importância heurística determinística (1-10 por tipo de MemEvent), escrita atômica evento+embedding na mesma transação respeitando o piso de importância, e recuperação semântica com o scoring de Generative Agents (recência × importância × relevância, min-max [0,1], pesos iguais α=1) que renova `last_access` e degrada gracioso quando o LLM/embedding está off.**

## Performance

- **Duration:** ~8 min
- **Tasks:** 2 (TDD)
- **Files modified:** 2 (ambos criados)

## Accomplishments

- **Funções puras (Task 1):** `importanceOf` (switch EXAUSTIVO sobre os 4 tipos de MemEvent, default 1), `summarizeEvent` (texto NL canônico — nunca o JSON cru), `recencyRaw` (decaimento exponencial 0.5^(idade/meia-vida)) e `minMaxNormalizer` (trata empate → 0, fiel ao Park). Pesos `W_RECENCY/W_IMPORTANCE/W_RELEVANCE = 1` exportados.
- **Pipeline de escrita atômica (Task 2):** `persistEvent` aplica o gate `ltImportanceFloor` antes de abrir a transação (eventos triviais retornam `null` sem tocar o DB) e insere evento + vetor na MESMA `db.transaction()` com o mesmo rowid.
- **Recuperação (Task 2):** `retrieve` faz KNN no `vec_events` (`MATCH ? AND k = retrievalK`) com JOIN para os campos relacionais, calcula os 3 fatores, normaliza cada um sobre os candidatos, soma com pesos iguais, ordena desc, corta no `limit` (default 5) e renova `last_access` dos retornados. Sem embedding válido cai para os mais recentes (relevance=0). Envolto em try/catch — nunca lança.
- **Verde:** `bun test src/memory/longTerm.test.ts` → 10 pass / 0 fail; suíte completa → 181 pass / 0 fail; `bun run typecheck` → exit 0.

## Assinaturas exatas (exportadas)

```typescript
// src/memory/longTerm.ts
export function importanceOf(e: MemEvent): number              // 1-10, switch exaustivo
export function summarizeEvent(e: MemEvent): string            // texto NL determinístico
export function recencyRaw(ageMs: number): number              // 0.5 ^ (ageMs / retrievalHalfLifeMs)
export function minMaxNormalizer(xs: number[]): (x: number) => number
export const W_RECENCY: number, W_IMPORTANCE: number, W_RELEVANCE: number  // = 1 (α=1)

export interface RetrievedEvent { id: number; summary: string; payload: string; importance: number; score: number }

export function persistEvent(
  db: Database, e: MemEvent, embedding: number[] | null, now: number, player?: string | null,
): number | null

export function retrieve(
  db: Database, queryEmbedding: number[] | null, now: number, opts?: { player?: string; limit?: number },
): RetrievedEvent[]
```

## Forma do RetrievedEvent

`{ id, summary, payload, importance, score }` — `summary` é o texto NL já embeddado (pronto para injetar em prompt), `payload` é o `JSON.stringify(MemEvent)` original (re-hidratável), `importance` é a nota bruta 1-10, e `score` é o valor combinado pós-normalização (não normalizado a [0,1] — é a soma ponderada dos 3 fatores normalizados, ∈ [0,3] com α=1).

## Filtro por player: JOIN vs metadata WHERE

**Escolhido JOIN relacional (`e.player = ?`).** Em ambos os caminhos da `retrieve`:
- **Caminho KNN:** `WHERE v.embedding MATCH ? AND k = ? AND e.player = ?` (o filtro de player roda sobre a coluna relacional `events.player` via JOIN, não sobre uma metadata column do vec0).
- **Caminho fallback (sem embedding):** `SELECT ... FROM events WHERE player = ? ORDER BY ts DESC`.

Motivo: o vec0 suporta metadata WHERE, mas `player` vive na tabela relacional `events` (não foi declarado como metadata column do `vec_events`). O JOIN por `rowid` é mais simples de raciocinar no MVP (RESEARCH Alternativas Considered) e evita duplicar `player` no índice vetorial. Evolução futura (pré-filtro por `importance` no próprio KNN) pode usar a metadata column `v.importance` já existente.

## Decisions Made

- **`last_access` = `now` no INSERT** (não `e.timestamp`). Garante que um evento recém-persistido entre na retrieve com recência máxima e que a renovação no passo 5 seja consistente com o relógio do scoring.
- **`relevance` no fallback = 0 para todos** → o `minMaxNormalizer` colapsa esse fator (span=0 → 0), então sem embedding só recência×importância decidem a ordem. Comportamento gracioso e previsível.
- **Filtro por player via JOIN** (ver seção acima).
- **persistEvent persiste o evento mesmo sem embedding válido** — só o INSERT em `vec_events` é condicional a `embedding && embedding.length === EMBEDDING_DIM`. O evento nunca se perde por LLM off; perde apenas a indexação semântica.

## Deviations from Plan

None — plano executado exatamente como escrito. As funções puras e o pipeline DB foram implementados conforme o código de referência do PLAN; a única decisão de design deixada em aberto pelo plano (filtro por player: metadata WHERE vs JOIN) foi resolvida por JOIN e documentada acima, conforme exigido pela seção `<output>`.

> Nota de processo: por o PLAN fornecer o código de referência completo de ambas as tasks, a implementação (longTerm.ts) e seus testes (longTerm.test.ts) foram escritos e verificados em conjunto, resultando em um único commit atômico (`f74da75`) que cobre Task 1 e Task 2. Ambos os conjuntos de testes (puros + DB) passam.

## Issues Encountered

- Nenhum. File-locking do Windows em SQLite/WAL já mitigado pelo padrão `safeCleanup` herdado de `vec.smoke.test.ts` (try/catch no unlink de `-wal`/`-shm`).

## Known Stubs

Nenhum. Todas as funções têm implementação completa e testada; nenhum valor hardcoded vazio flui para UI.

## Next Phase Readiness

- **MEM-03 implementado e testado.** Plans 04 (reflexão), 05 (perfis/holder durável) podem chamar `retrieve(db, queryEmbedding, now, { player })` para recuperação gatilhada e `persistEvent` para gravar eventos do loop. O caller é responsável por gerar o `queryEmbedding` via `provider.embed(summarizeEvent(...))` ou similar.
- **Próximo plano da fila:** 04-04.

## Self-Check: PASSED

- FOUND: src/memory/longTerm.ts (importanceOf, summarizeEvent, recencyRaw, minMaxNormalizer, persistEvent, retrieve)
- FOUND: src/memory/longTerm.test.ts (10 testes: 5 puros + 5 DB)
- FOUND: commit f74da75
- VERIFIED: `bun test src/memory/longTerm.test.ts` → 10 pass / 0 fail
- VERIFIED: `bun test` (suíte completa) → 181 pass / 0 fail
- VERIFIED: `bun run typecheck` → exit 0
- VERIFIED: longTerm.ts contém `db.transaction`, `MATCH`, `last_access = `, `config.ltImportanceFloor`

---
*Phase: 04-persist-ncia-reflex-o-e-identidade-viva*
*Completed: 2026-06-19*
