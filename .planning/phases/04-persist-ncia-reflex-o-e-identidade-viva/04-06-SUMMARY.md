---
phase: 04-persist-ncia-reflex-o-e-identidade-viva
plan: 06
subsystem: durable-mind
tags: [persistence, kv, decay-on-boot, holder, personality, sqlite, wal, shutdown, soc-02, mem-02, d-04, d-19]

# Dependency graph
requires:
  - phase: 04
    plan: 02
    provides: "openDb + kvSet/kvGet (tabela kv) — substrato do snapshot do holder"
  - phase: 04
    plan: 04
    provides: "PersonalityState + defaultPersonality + decayPersonality (estado vivo persistido + mean-reversion no boot)"
provides:
  - "src/cognition/state.ts — CognitiveStateHolder ganha db: Database|null e personality: PersonalityState (db=null e baseline por default)"
  - "src/memory/holder.persistence.ts — persistHolder/hydrateHolder: serializa/hidrata o estado vivo via kv['holder'] com decay-on-boot (D-04/D-19)"
  - "src/bot/index.ts — boot abre o DB e hidrata o holder 1x; SIGINT/SIGTERM persistem e fecham o DB (WAL checkpoint)"
affects: [04-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Snapshot do estado vivo em kv['holder'] como JSON (needs/goals/currentGoal/disposition/personality); control/safety/memory NÃO persistem (por-sessão)"
    - "Decay-on-boot ESCOPO curiosity: só curiosity re-decai por timestamp no hydrate; survival/resources ficam para o evaluateNeeds do 1º tick (no-op no hydrate)"
    - "Boot abre DB 1x e seta holder.db ANTES do loop; shutdown gracioso faz persistHolder + db.close() (WAL checkpoint) em SIGINT/SIGTERM"

key-files:
  created:
    - src/memory/holder.persistence.ts
    - src/memory/holder.persistence.test.ts
  modified:
    - src/cognition/state.ts
    - src/bot/index.ts

key-decisions:
  - "Snapshot persiste APENAS o estado vivo (needs/goals/currentGoal/disposition/personality); control/safety/memory são por-sessão e ficam de fora — a reconexão já reusa o holder em-processo (D-20), o disco cobre o RESTART completo"
  - "Decay-on-boot tem ESCOPO curiosity: survival/resources não são re-decaídos no hydrate porque são recomputados do snapshot do mundo no 1º tick (evaluateNeeds), evitando dupla-aplicação de decaimento"
  - "currentGoal é validado contra os goals sobreviventes pós-filtro: se o goal apontado foi descartado por staleness, currentGoal vira null (não retoma cego um objetivo morto)"
  - "hydrateHolder MUTA o holder recebido (em vez de retornar um novo) — preserva a identidade do objeto/fonte-única (Pattern 4/A4) já estabelecida no D-20"
  - "Boot abre o DB de produção via openDb() (default config.dbPath) — herda PRAGMAs WAL + recuperação graceful do 04-02 sem reabrir/replicar lógica"

requirements-completed: [MEM-02]

# Metrics
duration: ~6min
completed: 2026-06-19
---

# Phase 4 Plan 06: Mente durável em disco (holder + persistHolder/hydrateHolder) Summary

**A "mente" do agente agora sobrevive a um RESTART COMPLETO do processo (não só a reconexões): o `CognitiveStateHolder` ganha `db` + `personality`, `holder.persistence.ts` serializa o estado vivo (needs/goals/currentGoal/disposition/personality) em `kv['holder']` e o hidrata no boot com decay-on-boot (curiosity re-decai por timestamp, goals velhos descartados, personalidade revertida à baseline), e `bot/index.ts` abre o DB + hidrata 1x no boot e faz flush+close gracioso em SIGINT/SIGTERM — fechando MEM-02 no lado do estado vivo.**

## Performance

- **Duration:** ~6 min
- **Tasks:** 3 (Task 2 TDD: RED → GREEN, sem refactor)
- **Files modified:** 4 (2 criados, 2 modificados)

## Accomplishments

- **Holder estendido (Task 1 — D-04):** `CognitiveStateHolder` ganhou `db: Database | null` (handle do store durável, `null` em testes que não persistem) e `personality: PersonalityState`. `createCognitiveStateHolder(now)` retorna `db: null` e `personality: defaultPersonality(now)`. Nenhum campo existente alterado; o teste do holder do 04-* continua verde.
- **persistHolder/hydrateHolder (Task 2 — D-04/D-19):** novo módulo `holder.persistence.ts`. `persistHolder` grava um snapshot JSON do estado vivo em `kv['holder']` (control/safety/memory ficam de fora — são por-sessão). `hydrateHolder` lê o snapshot, aplica decay-on-boot e MUTA o holder. db `null` ou sem snapshot = no-op gracioso (cold start, D-03). 8 testes cobrindo round-trip, escopo do decay, clamp, staleness de goals, currentGoal órfão, mean-reversion da personalidade e o no-op de db null.
- **Boot/shutdown wiring (Task 3 — D-04/D-02):** `bot/index.ts` abre `openDb()`, seta `holder.db = db` e chama `hydrateHolder(db, holder, Date.now())` UMA vez antes do loop. `shutdown(signal)` faz `persistHolder` + `db.close()` (WAL checkpoint) em `SIGINT`/`SIGTERM`, com try/catch independente para cada passo. Assinaturas de `onBotReady`/`startCognitiveLoop` inalteradas (flush por reflexão é wiring do Plan 07).
- **Suíte completa verde:** 221 pass / 0 fail (28 arquivos); `bun run typecheck` exit 0.

## Forma exata do snapshot persistido em kv['holder']

```jsonc
// kv['holder'].value = JSON.stringify(...)
{
  "needs":       [ { "kind": "survival"|"resources"|"curiosity"|"shelter"|"social",
                     "value": number /*0..1*/, "lastSatisfiedAt": number } ],
  "goals":       [ { "id": string, "kind": string, "priority": number, "progress": number,
                     "dependsOn": string[], "source": "need"|"player_request", "committedAt": number } ],
  "currentGoal": Goal | null,
  "disposition": "AUTONOMOUS" | "ASSISTANT",
  "personality": { "mood": number, "socialEnergy": number, "confidence": number, "updatedAt": number }
}
```

`control`, `safety` e `memory` NÃO entram no snapshot (estado por-sessão).

## Assinaturas exatas (exportadas — o Plan 07 chama persistHolder ao fim de cada reflexão)

```typescript
// src/memory/holder.persistence.ts
export function persistHolder(db: Database | null, holder: CognitiveStateHolder, now: number): void
export function hydrateHolder(db: Database | null, holder: CognitiveStateHolder, now: number): CognitiveStateHolder
// HOLDER_KEY = 'holder' (chave em kv)

// src/cognition/state.ts (campos adicionados ao holder)
db: Database | null            // null por default; setado no boot após openDb
personality: PersonalityState  // defaultPersonality(now) por default
```

**Comportamento do decay-on-boot (`hydrateHolder`):**
- `curiosity.value = max(0, value - config.curiosityDecayPerMs * (now - lastSatisfiedAt))`; `survival`/`resources`/`shelter`/`social` preservados (recomputados no 1º tick via `evaluateNeeds`).
- `goals` filtrados: descarta `now - committedAt >= config.goalStaleMs`.
- `currentGoal` → `null` se seu `id` não está entre os goals sobreviventes.
- `personality = decayPersonality(snap.personality ?? defaultPersonality(now), now)` (mean-reversion).

## Decisions Made

- **Só o estado vivo persiste.** O snapshot cobre needs/goals/currentGoal/disposition/personality; control/safety/memory são reconstruídos por sessão. A reconexão já era coberta em-processo (D-20); o disco fecha o gap do RESTART completo do processo.
- **Decay-on-boot com escopo `curiosity`.** survival/resources viriam re-decaídos incorretamente se aplicados aqui — eles são derivados do snapshot do mundo (health/food/inventário) no primeiro `evaluateNeeds`, então o hydrate apenas os preserva.
- **`currentGoal` validado contra os goals pós-filtro.** Evita retomar cegamente um objetivo que já expirou por staleness; vira `null` quando o alvo morre.
- **`hydrateHolder` muta o holder** (não devolve um novo objeto) — mantém a identidade de fonte-única (Pattern 4/A4) que o resto da Fase 3/4 assume.

## Deviations from Plan

None — plano executado exatamente como escrito. As assinaturas, a forma do snapshot, o escopo do decay-on-boot e o wiring de boot/shutdown seguem o esboço do PLAN.md sem alterações de design. O único cuidado de runtime (cleanup de teste guardado contra EBUSY no Windows após `db.close()`) já era o padrão herdado do 04-02 e foi aplicado no novo teste, não um desvio.

## Known Stubs

None. O módulo é funcional e completo. A CHAMADA de `persistHolder` ao fim de cada reflexão/ciclo (flush periódico) é wiring deliberadamente alocado ao Plan 07 (conforme o objetivo do plano) — `holder.db` já está disponível para esse consumidor. Não é um stub deste plano.

## Issues Encountered

- File-locking do Windows em SQLite/WAL após `close()` (anotado no 04-01/04-02): o novo teste usa o mesmo `safeCleanup` guardado (varre `-wal`/`-shm`, ignora EBUSY) e fecha cada handle antes de reabrir o arquivo, simulando o RESTART com segurança.

## Next Phase Readiness

- **MEM-02 completo no lado do estado vivo:** a mente inteira (needs/goals/currentGoal/disposition/personality + memória LP no DB) sobrevive a um RESTART completo do processo, com mitigação de estado estálido (decay-on-boot).
- **Plan 07 pode:** (a) chamar `persistHolder(holder.db, holder, now)` ao fim de cada reflexão/ciclo para flush periódico, e (b) consumir `holder.personality` (injeção no prompt) e `holder.db` (stores LP/perfis) já cabeados no boot.
- **Próximo plano da fila:** 04-07 (último da Fase 4).

## Self-Check: PASSED

- FOUND: src/memory/holder.persistence.ts
- FOUND: src/memory/holder.persistence.test.ts
- FOUND: src/cognition/state.ts (db + personality)
- FOUND: src/bot/index.ts (openDb + hydrateHolder + SIGINT/SIGTERM)
- FOUND: commit 5a283ba (Task 1 — holder), 6f540e8 (test RED), 2b33c03 (Task 2 — feat), bb1ad54 (Task 3 — boot wiring)
- VERIFIED: `bun test src/memory/holder.persistence.test.ts src/cognition/state.test.ts` → 12 pass / 0 fail
- VERIFIED: `bun test` (suíte completa) → 221 pass / 0 fail
- VERIFIED: `bun run typecheck` → exit 0

---
*Phase: 04-persist-ncia-reflex-o-e-identidade-viva*
*Completed: 2026-06-19*
