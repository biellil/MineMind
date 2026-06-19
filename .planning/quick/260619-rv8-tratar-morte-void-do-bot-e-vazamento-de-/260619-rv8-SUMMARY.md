---
phase: quick-260619-rv8
plan: 01
subsystem: cognition
tags: [mineflayer, langgraph, memorysaver, perception, cognitive-loop, resilience]

# Dependency graph
requires:
  - phase: quick-260619-qwx
    provides: WorldSnapshot enriquecido (lookingAt/underfoot) consumido por buildWorldSnapshot
provides:
  - Percepção defensiva: buildWorldSnapshot retorna null quando bot.entity/position ausente (morte/void)
  - observe tolerante a snapshot null (degrada o tick para idle, não derruba o driver)
  - Ciclo de vida do loop: handlers death/respawn + parada graciosa por deadTicks (morte/void não emitem 'end')
  - Poda periódica do MemorySaver via deleteThread (contém vazamento de RAM com thread_id fixo)
  - buildGraph expõe { graph, checkpointer }
affects: [phase-07-grounding, phase-08-system1, loop-cognitivo, qualquer feature que rode sessões longas]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Percepção defensiva: corpo ausente -> snapshot null, nunca throw no tick"
    - "Driver resiliente: contador de ticks-sem-corpo encerra o while graciosamente (além do 'end')"
    - "Poda periódica do checkpointer in-memory com thread_id fixo (deleteThread por intervalo configurável)"

key-files:
  created:
    - src/cognition/loop.death.test.ts
  modified:
    - src/perception/snapshot.ts
    - src/perception/snapshot.test.ts
    - src/cognition/nodes.ts
    - src/cognition/graph.ts
    - src/cognition/loop.ts
    - src/config.ts
    - src/cognition/loop.smoke.test.ts
    - src/cognition/reconnect.test.ts
    - src/cognition/loop.phase3.smoke.test.ts

key-decisions:
  - "buildGraph retorna { graph, checkpointer } (forma limpa) em vez de Object.assign — exige desestruturar nos callers/testes"
  - "Parada por deadTicks (default 20 ~ 10s a 500ms/tick) em vez de só 'end' — morte/void não emitem 'end'"
  - "Poda do checkpointer é segura: a continuidade entre ticks vive no holder (fonte única), não no MemorySaver"

patterns-established:
  - "Tick que falha na percepção degrada para idle, nunca derruba o loop"
  - "Recursos in-memory com thread fixo recebem poda periódica configurável"

requirements-completed: [CR1, CR2, CR3]

# Metrics
duration: 6min
completed: 2026-06-19
---

# Quick 260619-rv8: Morte/void do bot e vazamento de RAM — Summary

**Percepção defensiva (snapshot null na morte/void), loop com parada graciosa por deadTicks e poda periódica do MemorySaver (deleteThread) para conter o vazamento de RAM em sessões longas.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-06-19T23:07:38Z
- **Completed:** 2026-06-19T23:13:47Z
- **Tasks:** 3
- **Files modified:** 9 (1 criado, 8 modificados)

## Accomplishments
- CR#1: `buildWorldSnapshot` agora retorna `WorldSnapshot | null` com guarda em `bot.entity?.position`; na morte/queda no void retorna null em vez de lançar e derrubar o tick.
- CR#1 a jusante: `observe` embrulha a captura — null/exceção viram `{ snapshot: null }`, degradando o tick para idle (analyze/execute já tratam null).
- CR#2: handlers `bot.on('death')`/`('respawn')` + contador `deadTicks` que encerra o `while` graciosamente quando o bot fica sem corpo por `config.deathStopTicks` ticks (morte/void não emitem 'end'), com flush defensivo antes do break.
- CR#3: `buildGraph` passa a expor o `checkpointer`; o driver poda o MemorySaver via `deleteThread('minemind-agent')` a cada `config.checkpointPruneIntervalMs`, evitando o acúmulo de 1 checkpoint por super-step sob o thread_id fixo.

## Task Commits

1. **Task 1: Percepção defensiva (CR#1) [TDD]** - `8dddfb8` (fix) — testes RED escritos antes; guarda implementada para GREEN.
2. **Task 2: observe tolerante a null + checkpointer podável (CR#1/CR#3)** - `59b234c` (refactor)
3. **Task 3: Ciclo de vida do loop — death/respawn, deadTicks, poda (CR#2/CR#3) [TDD]** - `eb1df53` (fix)

_Nota: TDD na Task 1 e 3 — testes escritos antes da implementação; consolidados em um commit por task (RED→GREEN sem refactor adicional)._

## Files Created/Modified
- `src/perception/snapshot.ts` - Guarda `if (!entity?.position) return null`; assinatura `WorldSnapshot | null`.
- `src/perception/snapshot.test.ts` - 2 testes novos (entity undefined / position undefined → null); asserções `snap!` nos casos não-null.
- `src/cognition/nodes.ts` - `observe` embrulha `buildWorldSnapshot` em try/catch + early-return `{ snapshot: null }`.
- `src/cognition/graph.ts` - `buildGraph` retorna `{ graph, checkpointer }`.
- `src/cognition/loop.ts` - Handlers death/respawn; contador `deadTicks` + parada graciosa; poda periódica do checkpointer; desestrutura `{ graph, checkpointer }`.
- `src/config.ts` - `checkpointPruneIntervalMs` (60s, 0 desativa) e `deathStopTicks` (20) com validação de range.
- `src/cognition/loop.death.test.ts` - Novo: prova (a) invoke sem corpo → snapshot null sem rejeitar; (b) `deleteThread` chamável sem lançar.
- `src/cognition/loop.smoke.test.ts`, `src/cognition/reconnect.test.ts`, `src/cognition/loop.phase3.smoke.test.ts` - Desestruturam `{ graph }` (mudança de retorno de buildGraph).

## Decisions Made
- **Forma de retorno de buildGraph:** escolhida a variante limpa `{ graph, checkpointer }` (em vez de `Object.assign` retrocompatível). Custo: ajustar 3 arquivos de teste que chamavam `.invoke` direto.
- **Parada do loop:** `deadTicks >= config.deathStopTicks` complementa o `bot.once('end')` existente — cobre morte/void que não emitem 'end'. Default 20 ticks (~10s) dá tempo ao respawn automático do Mineflayer.
- **Segurança da poda:** documentada no código — o estado entre ticks vive no holder (fonte única), então `deleteThread` é seguro; o próximo invoke recria o estado inicial e `observe` re-semeia do holder.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Atualizar loop.phase3.smoke.test.ts para a nova forma de retorno de buildGraph**
- **Found during:** Task 3 (typecheck `bun run typecheck`)
- **Issue:** O plano (Task 2) listava apenas `loop.smoke.test.ts` e `reconnect.test.ts` como callers a ajustar, mas `loop.phase3.smoke.test.ts` também chama `buildGraph(...).invoke` em 3 pontos — o typecheck falhou com TS2339 (`Property 'invoke' does not exist on { graph, checkpointer }`).
- **Fix:** Desestruturar `const { graph } = buildGraph(...)` nas 3 ocorrências (linhas 65, 96, 158).
- **Files modified:** src/cognition/loop.phase3.smoke.test.ts
- **Verification:** `bun run typecheck` limpo; suíte completa verde.
- **Committed in:** eb1df53 (commit da Task 3)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Ajuste mecânico necessário para o typecheck passar; mesma natureza dos dois testes já previstos no plano. Sem scope creep.

## Issues Encountered
None — fluxo TDD seguiu RED→GREEN previsto; a única surpresa foi o terceiro arquivo de teste afetado pela mudança de retorno (documentado como deviation Rule 3).

## User Setup Required
None. As novas chaves de config têm defaults (`CHECKPOINT_PRUNE_INTERVAL_MS=60000`, `DEATH_STOP_TICKS=20`); nenhum serviço externo.

## Verification
- `bun test` — 256 pass, 1 skip, 0 fail (257 testes em 35 arquivos).
- `bun run typecheck` — limpo (tsc --noEmit sem erros).
- Revisão manual: nenhuma leitura de `bot.entity.position` sem guarda restou em snapshot.ts.

## Next Phase Readiness
- Loop cognitivo agora resiliente a morte/void e a sessões longas — desbloqueia testes ao vivo de longa duração (relevante ao gate da Phase 14 sobre "estado sobrevive a kill duro").
- Sem blockers introduzidos.

## Self-Check: PASSED

- FOUND: src/cognition/loop.death.test.ts
- FOUND: src/perception/snapshot.ts (guarda bot.entity)
- FOUND commit 8dddfb8 (Task 1)
- FOUND commit 59b234c (Task 2)
- FOUND commit eb1df53 (Task 3)

---
*Quick task: 260619-rv8*
*Completed: 2026-06-19*
