---
phase: 04-persist-ncia-reflex-o-e-identidade-viva
plan: 07
subsystem: living-identity
tags: [refl-01, soc-01, soc-02, mem-02, mem-03, d-10, d-12, d-19, single-flight, reflection, durable-flush, loop]
status: PARTIAL — código entregue; verificação humana AO VIVO (Task 3) AINDA PENDENTE

# Dependency graph
requires:
  - phase: 04
    plan: 02
    provides: "openDb + kv (substrato do flush do holder)"
  - phase: 04
    plan: 03
    provides: "retrieve/persistEvent (LP) — recuperação gatilhada na reflexão"
  - phase: 04
    plan: 05
    provides: "shouldReflect/consolidate/applyGoalUpdates (peças puras da reflexão)"
  - phase: 04
    plan: 06
    provides: "persistHolder/hydrateHolder + holder.db (flush durável da mente)"
provides:
  - "src/cognition/deliberation.ts — trigger 'reflect' + runReflection no single-flight; maybeDeliberate retorna Promise<boolean>; reflect pula o budget de replan de AÇÃO mantendo o lock inFlight (D-12)"
  - "src/cognition/loop.ts — gatilho híbrido shouldReflect dispara reflect via single-flight; rearma o gatilho SÓ quando a reflexão de fato roda (.then(ran)); flush no bot.once('end') + flush periódico no tick"
  - "src/config.ts — holderFlushIntervalMs (HOLDER_FLUSH_INTERVAL_MS, default 30000, valida >=0)"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-flight compartilhado ação×reflexão: um lock inFlight (D-12) MAS budgets separados — replanMinIntervalMs é só para AÇÃO; reflexão tem cadência própria via shouldReflect (D-10)"
    - "Gatilho de reflexão rearmado por efeito do resultado: void maybeDeliberate('reflect').then((ran)=>{ if (ran) reset }) — preserva o gatilho quando o reflect no-opa por contenção"
    - "Durabilidade em camadas: reflexão (fim de ciclo) + bot.once('end') (fim de sessão) + flush periódico no tick (bound de perda em crash duro) + SIGINT/SIGTERM (shutdown gracioso)"

key-files:
  created:
    - ".planning/phases/04-persist-ncia-reflex-o-e-identidade-viva/04-07-SUMMARY.md"
  modified:
    - "src/cognition/deliberation.ts"
    - "src/cognition/loop.ts"
    - "src/config.ts"
    - "src/cognition/reflection.integration.smoke.test.ts"
    - ".gitignore"

decisions:
  - "B1: ação e reflexão compartilham o lock inFlight (D-12 — nunca duas inferências no modelo local fraco) MAS NÃO o budget: replanMinIntervalMs é só para replanejamento de AÇÃO (D-19); a reflexão é governada por shouldReflect (D-10), senão o budget de ação a deixaria faminta para sempre."
  - "B1: o loop só rearma lastReflectionAt/importanceAccum quando o reflect EFETIVAMENTE roda (maybeDeliberate retorna true via .then). Antes o rearme incondicional auto-desarmava o gatilho a cada no-op, e a reflexão nunca disparava em runtime."
  - "B2: flush durável em camadas — bot.once('end') (desconexão/crash de sessão) + flush periódico no tick (HOLDER_FLUSH_INTERVAL_MS, bound de perda em OOM/kill -9). SIGINT/SIGTERM em bot/index.ts mantidos como estavam."

metrics:
  duration: ~25 min (correção de bugs pós-checkpoint)
  tasks_completed: 2 de 3 (Task 3 = verificação humana ao vivo PENDENTE)
  completed_date: 2026-06-19
---

# Phase 04 Plan 07: Identidade Viva no Loop — Correção B1/B2 Summary

Liga a reflexão (REFL-01/D-10/D-12) ao loop cognitivo vivo e torna o flush da mente durável fora do caminho de signal — duas falhas de wiring que a verificação ao vivo expôs após o checkpoint do plano 04-07.

## O que foi corrigido

### B1 — Reflexão faminta (nunca disparava em runtime)

Ação e reflexão compartilhavam o MESMO `DeliberationState` (um `inFlight` + um `lastRunAt`/`replanMinIntervalMs`). A cada tick a ação disparava primeiro (`loop.ts` ~linha 84) e setava `inFlight=true` antes do primeiro `await`, então a chamada de reflexão (~linha 116) sempre batia em `if (state.inFlight) return`. Pior: o loop rearmava `reflState.lastReflectionAt`/`importanceAccum` de forma INCONDICIONAL (~linhas 114-115), mesmo quando o reflect fazia no-op — o piso anti-starvation e o acumulador se auto-desarmavam e a reflexão nunca podia disparar.

Correção:
- `maybeDeliberate(...)` agora retorna `Promise<boolean>` — `true` só quando o trabalho de deliberação/reflexão executou; `false` no no-op (inFlight, budget, ou `shouldTrigger=false`). Tipo atualizado em `createDeliberator` e em todos os call-sites.
- Para `trigger === 'reflect'`: mantém o guard `if (state.inFlight) return false` (preserva D-12 — sem sobreposição com ação) mas PULA o gate `replanMinIntervalMs` (esse budget é só para replanejamento de AÇÃO, D-19). A cadência da reflexão vem de `shouldReflect` no loop (D-10).
- Em `loop.ts`: o rearme de `reflState` agora acontece SÓ quando a reflexão de fato rodou, via `void maybeDeliberate('reflect').then((ran) => { if (ran) { reflState.lastReflectionAt = reflectNow; reflState.importanceAccum = 0; console.log('[reflect] reflexão executada') } })`. Quando o reflect no-opa por contenção com uma ação, o gatilho é preservado e tenta de novo num tick posterior (na janela livre de `inFlight` entre ações, dentro de ~`replanMinIntervalMs`).
- Log `[reflect] reflexão executada` adicionado para observabilidade ao vivo.

### B2 — Flush só em signal (estado vivo perdido em crash/OOM/desconexão)

`persistHolder` rodava só em SIGINT/SIGTERM (`bot/index.ts`) e ao fim de cada reflexão (`runReflection`). Como a reflexão nunca disparava (B1) e `bot.once('end')` só parava o loop, um crash/OOM/desconexão perdia TODO o estado vivo desde o boot.

Correção:
- Flush no `bot.once('end', ...)` em `loop.ts`: `if (holder.db) persistHolder(holder.db, holder, Date.now())`, guardado em try/catch (nunca lança no shutdown).
- Flush periódico no tick: nova config `holderFlushIntervalMs` (env `HOLDER_FLUSH_INTERVAL_MS`, default 30000, valida `>= 0`); flush quando `now - lastFlushAt >= config.holderFlushIntervalMs`, guardado em `holder.db`. Limita a perda em crash duro (OOM/`kill -9`) a no máximo essa janela.
- O flush SIGINT/SIGTERM em `bot/index.ts` foi mantido inalterado.

## Restrições de design preservadas

- **D-12** (nunca duas inferências LLM concorrentes): o lock `inFlight` segue valendo para ação E reflexão — reflect ainda NÃO sobrepõe uma ação in-flight (testado em F).
- **D-19**: `replanMinIntervalMs` continua sendo APENAS o budget de replanejamento de ação.
- A reflexão NÃO virou um nó novo do StateGraph — segue reusando o caminho de deliberação single-flight.
- `consolidate`/`applyGoalUpdates`/internos de `runReflection` inalterados.

## Testes de regressão (FALHAVAM antes, PASSAM depois)

Adicionados a `src/cognition/reflection.integration.smoke.test.ts`:
- **D)** `maybeDeliberate` retorna `true` ao executar e `false` no no-op (inFlight ou budget de ação consumido).
- **E)** reflect NÃO é gated pelo `replanMinIntervalMs` de ação: logo após uma ação consumir `lastRunAt`, um `maybeDeliberate('reflect')` com `inFlight=false` AINDA roda (retorna `true`) e produz um evento consolidado `type='reflection'` — prova que a reflexão não está mais faminta.
- **F)** reflect respeita D-12: enquanto uma ação está in-flight, `maybeDeliberate('reflect')` retorna `false` e não inicia uma segunda inferência.

## Resultados de verificação

- `bun run typecheck` — LIMPO.
- `bun test src/cognition/reflection.integration.smoke.test.ts` — 6 pass / 0 fail (3 originais + 3 regressão).
- `bun test src/cognition` — 79 pass / 0 fail.
- `bun test` (suíte completa) — 226 pass / 1 fail. A única falha (`config > carrega com valores default sem .env`) é PRÉ-EXISTENTE e fora de escopo: o `.env` local seta `PERCEPTION_RADIUS=8` (workaround do OOM já rastreado em STATE.md). Confirmado idêntico no baseline (git stash) ANTES de qualquer alteração deste plano.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] DB durável de runtime não estava no .gitignore**
- **Found during:** verificação pós-fix (`git status` mostrou `minemind.sqlite*` untracked)
- **Issue:** o default `dbPath: './minemind.sqlite'` gera `minemind.sqlite` + `-wal`/`-shm` ao rodar; sem ignore vazariam para o repo.
- **Fix:** adicionado padrão `minemind.sqlite` / `-wal` / `-shm` / `*.sqlite.corrupt-*` ao `.gitignore`.
- **Files modified:** `.gitignore`
- **Commit:** 2095271

## Known Stubs / Gaps

- **Tasks 1 do plano original (personalidade no prompt + perfis/trust + gate de trust)** já estavam implementadas e commitadas antes deste fix (commit base `b12d25d`). Este SUMMARY documenta o fechamento de B1/B2 que faltava no wiring vivo.
- **Open Question 3 (detecção de "atacado por jogador"):** segue como heurística/gap conhecido — não endereçado aqui.

## Task 3 — Verificação humana AO VIVO: STILL PENDING

O gate de verificação humana ao vivo do plano 04-07 NÃO foi executado. O Phase 4 NÃO está completo. Re-verificação ao vivo necessária para confirmar B1/B2 em runtime real (servidor MC + LM Studio).

### Passos de re-verificação ao vivo

**Reflexão agora dispara (B1):**
1. Apagar qualquer `minemind.sqlite*` antigo (cold start limpo).
2. `bun start` com LM Studio (chat + embedding carregados) e servidor MC 1.21.4. Confirmar log "Mente hidratada do disco".
3. Deixar rodar ~2-3 min (ou baixar `REFLECTION_MAX_INTERVAL_MS`/`REFLECTION_IMPORTANCE_THRESHOLD` para acelerar). Confirmar no log `[reflect] reflexão executada` (antes do fix, NUNCA aparecia).
4. Inspecionar o DB: `SELECT COUNT(*) FROM events WHERE type='reflection'` deve ser >= 1.

**Estado sobrevive a crash duro / OOM (B2):**
5. Com o processo rodando ~1 min (mais que `HOLDER_FLUSH_INTERVAL_MS=30000`), matar o processo SEM signal gracioso (simular OOM): no Windows `taskkill /F /PID <pid>` (equivalente a `kill -9`).
6. `bun start` de novo. Confirmar "Mente hidratada do disco" COM dados — needs/goals/personality retomados (o flush periódico gravou kv['holder'] antes do kill, mesmo sem SIGINT). Antes do fix, um kill duro perderia tudo desde o boot.
7. (Opcional) repetir derrubando o servidor MC para forçar `bot.once('end')` sem matar o processo — confirmar log "[loop] mente persistida ao encerrar a sessão (bot end)".

Marcar Phase 4 completo SOMENTE após o humano confirmar que reflexão dispara ao vivo E o estado sobrevive a um kill duro.

## Self-Check: PASSED
- src/cognition/deliberation.ts — FOUND (modified)
- src/cognition/loop.ts — FOUND (modified)
- src/config.ts — FOUND (modified)
- src/cognition/reflection.integration.smoke.test.ts — FOUND (modified)
- .gitignore — FOUND (modified)
- Commit 2095271 (fix B1/B2) — FOUND
- Commit 3aa1376 (test regressão) — FOUND
