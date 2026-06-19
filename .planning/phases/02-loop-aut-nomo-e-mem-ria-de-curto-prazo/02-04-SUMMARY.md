---
phase: 02-loop-aut-nomo-e-mem-ria-de-curto-prazo
plan: 04
subsystem: cognition
tags: [smoke-test, langgraph, recursion-limit, memorysaver, bun-test, checkpoint, headless]

# Dependency graph
requires:
  - phase: 02-loop-aut-nomo-e-mem-ria-de-curto-prazo
    plan: 03
    provides: buildGraph (StateGraph finito-por-tick + MemorySaver), startCognitiveLoop (driver externo), createNodes
  - phase: 02-loop-aut-nomo-e-mem-ria-de-curto-prazo
    plan: 01
    provides: createControlState, ShortTermMemory (events)
  - phase: 02-loop-aut-nomo-e-mem-ria-de-curto-prazo
    plan: 02
    provides: createSafetyState, arbitrate
  - phase: 01-presenca-e-conexao
    provides: buildWorldSnapshot (campos do bot que o mock satisfaz), executeWithSafety, skill navigate
provides:
  - "Prova automatizada (headless) de que o loop multi-tick NAO estoura o recursionLimit (Pitfall 1 / COG-01)"
  - "Prova de acumulo de memoria entre ticks (MemorySaver + thread_id / MEM-01)"
  - "Prova de que paused -> idle sem disparar skill (D-08)"
affects: [fase-03 (LLM no no decide — a base multi-tick estavel ja esta provada)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Smoke test headless com Bot mockado minimo: fornece SO os campos lidos por buildWorldSnapshot + bot.pathfinder.goto da skill navigate"
    - "Prova NEGATIVA do recursionLimit: invocar o grafo finito 26x (>25) pelo mesmo thread_id e confirmar ausencia de GraphRecursionError"

key-files:
  created:
    - src/cognition/loop.smoke.test.ts
  modified: []

key-decisions:
  - "26 ticks (acima de 25, abaixo do custo de 30) para a prova negativa do Pitfall 1 — mantem o teste verde e rapido (~36s) dado o duplo delay gaussiano de executeWithSafety"
  - "Mundo-vazio no mock -> arbitragem autonoma cai em 'exploring' -> navigate(XYZ) -> bot.pathfinder.goto (resolve imediato), exercitando o caminho real de skill sem servidor"

requirements-completed: []

# Metrics
duration: 6min
completed: 2026-06-19
---

# Phase 2 Plan 04: Smoke Test do Loop + Verificacao ao Vivo (Checkpoint) Summary

**Task 1 (automatizada) concluida e committada: um smoke test headless invoca o grafo cognitivo 26 vezes pelo mesmo thread_id com um Bot mockado minimo e prova — negativamente — que NAO ha GraphRecursionError (sem self-loop interno; o ciclo e o driver externo, Pitfall 1), que a memoria de curto prazo acumula eventos entre ticks (MemorySaver + thread_id) e que o modo paused mantem o agente em idle sem disparar skill. Task 2 (verificacao ao vivo contra um servidor Minecraft Java local) e um checkpoint humano — exige um servidor MC e um observador humano, indisponiveis nesta maquina headless — e esta AGUARDANDO acao humana.**

## Status

- **Task 1 — Smoke test headless:** CONCLUIDA, committada (`9f58e3b`).
- **Task 2 — Verificacao ao vivo (checkpoint:human-verify, gate=blocking):** AGUARDANDO acao humana. Requer um servidor Minecraft Java local em offline-mode (MC_VERSION padrao 1.21.4 em localhost:25565) e um humano observando o avatar no jogo. Nao automatizavel nesta maquina de pesquisa headless.

## Performance

- **Duration:** ~6 min (Task 1)
- **Started:** 2026-06-19
- **Completed (Task 1):** 2026-06-19
- **Tasks:** 2 (1 concluida, 1 aguardando humano)
- **Files modified:** 1 (1 criado)

## Accomplishments
- **Smoke test headless** (`src/cognition/loop.smoke.test.ts`, `bun:test`):
  - **Teste 1 — prova negativa do Pitfall 1:** constroi o grafo via `buildGraph({ bot, control, safety })` e o invoca 26 vezes (`> recursionLimit 25`) pelo mesmo `thread_id`. Nenhum invoke lanca — em especial, nenhum `GraphRecursionError`. Prova arquitetural de que o ciclo always-on e o driver EXTERNO (re-invoke por tick), nao um self-loop interno.
  - **Teste 2 — acumulo de memoria:** apos 5 ticks, `last.memory.events.length > 0` — o no `execute` gravou ao menos uma acao (navigate de `exploring`) e o estado persistiu via `MemorySaver` + `thread_id`.
  - **Teste 3 — freio de controle:** com `createControlState('paused')`, `last.cogState === 'idle'` e nenhum evento de acao gravado (`events.length === 0`).
- **Bot mockado minimo:** fornece exatamente o que `buildWorldSnapshot` le (`username`, `health`, `food`, `entity.position` com `distanceTo`, `time.timeOfDay`, `entities`, `players`, `inventory.items()`, `findBlocks`, `blockAt`) + `pathfinder.goto` que a skill `navigate` exercita no caminho XYZ. Mundo vazio -> arbitragem autonoma cai em `exploring` -> `navigate` resolve imediato.

## Task Commits

1. **Task 1: smoke test headless** — `9f58e3b` (test)

## Files Created/Modified
- `src/cognition/loop.smoke.test.ts` — 3 testes `bun:test`: prova negativa do recursionLimit (26 ticks), acumulo de memoria entre ticks, paused -> idle. Mock minimo de Bot.

## Test / Verification Result

```
bun test src/cognition/loop.smoke.test.ts
 3 pass
 0 fail
 7 expect() calls
Ran 3 tests across 1 file. [35.77s]
```

- 26 ticks executados, todos com log `[loop] estado=exploring ... OK navigate {...}` — sem nenhum `GraphRecursionError`.
- Tick final com `paused`: `[loop] estado=idle modo=paused` / `[loop] sem acao (estado=idle)`.
- `bun run typecheck` -> exit 0.

## Decisions Made
- **26 ticks** (nao 30) para a prova negativa do Pitfall 1: acima do recursionLimit de 25 (preserva a prova) e abaixo do custo de 30 dado o duplo delay gaussiano de `executeWithSafety` (o no `execute` envolve `navigate`, que por sua vez chama `executeWithSafety` de novo). Mantem o teste verde em ~36s.
- **Mundo-vazio no mock** para forcar `exploring` -> `navigate(XYZ)` -> `bot.pathfinder.goto`: exercita o caminho de skill real do loop sem precisar de servidor, e prova o acumulo de memoria (cada navigate grava um evento `action/success`).

## Deviations from Plan

None - plano executado conforme escrito. O esqueleto do plano foi seguido com ajustes esperados e ja autorizados pelo proprio plano: (1) usei **26 ticks** no primeiro teste (o plano permite "reduza para 26 ticks ... NAO abaixo de 26" se 30 ficar lento); (2) adicionei `findBlock: () => null` ao mock (o plano instrui "adicione campos ao mock ate buildWorldSnapshot/skill rodar sem lancar"); (3) timeouts por teste para acomodar o delay gaussiano humanizado. Nenhuma mudanca de contrato.

## Known Stubs
None - o smoke test exercita o caminho real do grafo (sem stub de logica). O mock e um duble de teste do Bot (esperado e necessario para um teste headless), nao um stub de producao.

## Awaiting Human Action (Task 2 — checkpoint:human-verify)

A verificacao ao vivo (Criterio #2 do roadmap) exige um servidor Minecraft Java local + observacao humana no jogo. Passos exatos do plano:

**Pre-requisito (humano):** servidor Minecraft Java local em offline-mode, na versao do config (`MC_VERSION`, padrao 1.21.4), acessivel em `MC_HOST:MC_PORT` (padrao `localhost:25565`). Entrar no servidor com um cliente Minecraft para observar o agente.

1. Iniciar o agente: `bun run start` (a partir de `/root/MineMind`). Confirmar no console `[MineMind] Online ...` e `[loop] iniciado (modo autonomo)`.
2. Observar os logs `[loop] estado=...` mudando ao longo do tempo. **CRITERIO #1/#2:** confirmar que o agente alterna estados (ex.: exploring -> gathering -> exploring) e que, no jogo, o avatar se MOVE/coleta sozinho, SEM nenhuma chamada a LLM (nenhum LM Studio rodando).
3. **CRITERIO #3 (anti-repeticao/backoff):** colocar o agente perto de um bloco-alvo inalcancavel (ex.: cercado) e confirmar nos logs que ele NAO martela indefinidamente — apos algumas tentativas aparece `abandonando ...` ou `FALHA ...` e ele troca de comportamento (nao trava).
4. **Controle de chat (D-08/D-09):** no chat do jogo digitar `!pausar` (agente para de agir; logs `estado=idle`, avatar parado), `!livre` (volta a agir), `!vem` perto de voce (aproxima-se e aguarda) e uma frase qualquer como `ola` (IGNORADA, sem mudanca de modo).
5. **Memoria (MEM-01, opcional):** confirmar nos logs que acoes recentes sao registradas (sucesso/falha por tick).
6. **Reconexao (opcional):** parar e reiniciar o servidor; confirmar que o agente reconecta com um novo `[loop] iniciado`, sem dois loops concorrentes (sem logs duplicados por tick).

**Sinal de resume:** digite "aprovado" se os criterios 1-4 passaram ao vivo, ou descreva os problemas observados (que viram gaps via `/gsd:plan-phase --gaps`).

## Threat Surface
- **T-02-12 (Tampering — smoke test mock bot):** aceito por design — codigo de teste, nao de producao; o mock e um duble de teste e nao cruza fronteira de confianca. Sem mitigacao necessaria.
- **T-02-13 (DoS — verificacao ao vivo):** aceito — servidor Java local controlado, offline-mode, uso de desenvolvimento; sem exposicao externa.

Nenhuma superficie de seguranca nova fora do threat model.

## Next Phase Readiness
- Base multi-tick estavel provada de forma automatizada: o loop cruza o limite de 25 super-steps via driver externo sem erro. A Fase 3 pode plugar o LLM no no `decide`/`analyze` sobre uma fundacao testada.
- Pendente apenas: confirmacao humana ao vivo (Task 2) — nao bloqueia o trabalho de codigo, mas e o gate do Criterio #2 do roadmap.

## Self-Check: PASSED

- FOUND: src/cognition/loop.smoke.test.ts
- FOUND commit: 9f58e3b
- bun test src/cognition/loop.smoke.test.ts: 3 pass / 0 fail | typecheck: exit 0

---
*Phase: 02-loop-aut-nomo-e-mem-ria-de-curto-prazo*
*Task 1 completed: 2026-06-19 | Task 2 awaiting human verification*
