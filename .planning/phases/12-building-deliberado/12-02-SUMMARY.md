---
phase: 12-building-deliberado
plan: 02
subsystem: cognition
tags: [building, routing, skill-registry, deterministic-goal-router, stub-states]

# Dependency graph
requires:
  - phase: 12-building-deliberado (Plan 01)
    provides: "skill build (shelter/wall/tower/station/custom), buildTool, BuildSchema, runBlueprint — prontos para registro"
  - phase: 10-tech-tree (DAG)
    provides: "goalToSkillParams + DAG_PREFIXES — MOLDE do roteador determinístico espelhado por build:*"
  - phase: 09-placement-crafting (G-01)
    provides: "dispatch G-01 (state==='building' && fresh) — caminho SEPARADO, intocado (D-14)"
provides:
  - "skill build registrada em skillRegistry['build'] + buildTool em toolRegistry (executável pelo loop)"
  - "buildGoalToSkillParams + BUILD_PREFIXES — roteador determinístico build:* (build:shelter/wall/tower/station → build({tipo}))"
  - "estado 'building' não é mais stub (STUB_STATES = ['fighting'])"
affects: [12-03-loop-shelter, building, combate]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Roteador determinístico paralelo: build:* espelha goalToSkillParams (Fase 10) como prefixo independente — LLM=diretor, skill=engenheiro (D-13)"
    - "Caminho SEPARADO: build:* no execute roda ANTES de gathering/building com guard !skill, sem tocar o dispatch G-01 (D-14) nem o roteador DAG"

key-files:
  created:
    - src/cognition/nodes.build.test.ts
  modified:
    - src/skills/index.ts
    - src/cognition/nodes.ts
    - src/cognition/states.ts

key-decisions:
  - "D-13: build:<sub> → build({tipo:<sub>}) com dims/origin undefined — a skill preenche com config defaults + origin=floor(bot.position) na execução (Open Question 3)"
  - "Roteador build:* posicionado APÓS o roteador DAG e ANTES de gathering/building, com guard !skill — prefixos build:/gather: são disjuntos, mas a ordem mantém precedência clara"
  - "G-01 (state==='building' && fresh) NÃO tocado: build:* é um canal de GOAL determinístico; G-01 é o canal de VERBO da decisão LLM — coexistem (D-14)"

requirements-completed: [BUILD-02, BUILD-03]

# Metrics
duration: 6min
completed: 2026-06-22
---

# Phase 12 Plan 02: Registro e Roteamento da Skill Build Summary

**A skill `build` (Plan 01) foi fiada no loop cognitivo por um canal SEPARADO: registrada em `skillRegistry`/`toolRegistry` e roteada por um prefixo determinístico `build:*` que espelha o roteador DAG da Fase 10 — `build:shelter`/`wall`/`tower`/`station` resolve para `build({tipo})` SEM o LLM conhecer a mecânica de construção, sem acoplar nem tocar o dispatch G-01 da Fase 9.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-06-22T20:55:39Z
- **Completed:** 2026-06-22T21:01:50Z
- **Tasks:** 2
- **Files modified:** 4 (1 criado, 3 modificados)

## Accomplishments
- `skillRegistry['build']` agora resolve para a skill build e `toolRegistry` expõe `buildTool` (12 skills/tools) — o loop pode executar building deliberado
- `buildGoalToSkillParams` + `BUILD_PREFIXES` espelham `goalToSkillParams`/`DAG_PREFIXES`: um goal `build:<sub>` mapeia determinísticamente para `build({tipo:<sub>})`, sem LLM (D-13)
- Roteador `build:*` no execute roda num bloco PARALELO ao roteador DAG (após ele, antes de gathering/building) com guard `!skill` — não sobrescreve skill já resolvida nem toca o dispatch G-01
- `'building'` removido de `STUB_STATES` (resta só `'fighting'`, Fase 13) — o estado de construção é real e selecionável por goal determinístico
- A skill `build` cai no dispatch comum (`{ ...JSON.parse(target), signal }`) sem nenhuma alteração: `JSON.parse('{"tipo":"shelter"}')` + signal é exatamente o que a skill espera

## Como o build:* foi fiado em paralelo ao DAG

O roteador DAG (Fase 10) roteia `gather:/craft:/smelt:/ensure:` por `goalToSkillParams`. O canal `build:*` é um **espelho independente**:

1. **`buildGoalToSkillParams(goalId)`** (nodes.ts, após `goalToSkillParams`): se `goalId` começa com `build:`, fatia o sufixo e devolve `{ skill: 'build', paramsJson: JSON.stringify({ tipo: sub }) }`. Sub vazio → null. Prefixo errado → null.
2. **Bloco de roteamento no execute** (após `=== Fim do roteador Fase 10 ===`, antes de `state === 'gathering'`): `if (!skill && snap && currentGoal && BUILD_PREFIXES.some(...))` → chama `buildGoalToSkillParams`, seta `skill='build'`/`target=paramsJson`, loga `[build] roteando ...`.
3. O guard `!skill` garante que o DAG (se já resolveu uma skill) tem precedência; como `build:` e `gather:` são prefixos disjuntos, na prática nunca colidem, mas a ordem fica clara.

## Confirmação: G-01 e isStub intactos

- **G-01 (D-14):** `grep -c "state === 'building' && fresh" src/cognition/nodes.ts` → 1. O bloco que resolve o VERBO da decisão LLM (craft/smelt/equip/place) no estado agregado `'building'` está byte-for-byte intacto. `build:*` é o canal de GOAL determinístico; G-01 é o canal de VERBO do LLM — coexistem sem interferência.
- **isStub (Pitfall 4):** `grep -rn "isStub('building')" src/` → vazio. Nenhum call-site curto-circuitava o loop via `isStub('building')`, então remover `'building'` de `STUB_STATES` é seguro. `isStub` só é definido em `states.ts`, nunca chamado como gate.
- **Roteador DAG:** inalterado pelo plano — o bloco `build:*` é adicionado APÓS, não dentro.

## Task Commits

1. **Task 1: Registrar skill build no skillRegistry/toolRegistry** — `78dc3bd` (feat)
2. **Task 2: Roteador build:* no execute + 'building' fora de STUB_STATES + teste** — `4403b46` (feat)

## Files Created/Modified
- `src/skills/index.ts` — import/re-export de `build`/`buildTool`/`BuildSchema`/`runBlueprint`; `build` no `skillRegistry`; `buildTool` no `toolRegistry`
- `src/cognition/nodes.ts` — `BUILD_PREFIXES` + `buildGoalToSkillParams` (após `goalToSkillParams`); bloco roteador `build:*` no execute (paralelo ao DAG)
- `src/cognition/states.ts` — `STUB_STATES = ['fighting']` ('building' removido; comentário atualizado)
- `src/cognition/nodes.build.test.ts` — 5 testes de `buildGoalToSkillParams` (shelter/wall/station → tipo correto; gather:oak_log → null; build: → null)

## Decisions Made
- **D-13 (roteamento determinístico):** `build:<sub>` → `build({tipo:<sub>})` com `dims`/`origin` undefined. A skill preenche `dims=config.build<Tipo>Dims` e `origin=floor(bot.position)` no momento da execução (confirma Open Question 3 da RESEARCH). O LLM nunca conhece coordenadas/dimensões de construção.
- **Posicionamento do roteador:** o bloco `build:*` vai APÓS o roteador DAG e ANTES de `gathering`/`building`, com guard `!skill`. Mantém a precedência explícita sem risco de colisão (prefixos disjuntos).
- **D-14 (canal separado):** o dispatch G-01 (`state==='building' && fresh`) NÃO foi tocado. `build:*` roteia por GOAL (determinístico, sem LLM); G-01 resolve VERBO da decisão LLM. São canais ortogonais que compartilham o mesmo dispatch comum de params no fim do execute.

## Deviations from Plan

### Out-of-scope discoveries (logged, not fixed)

**1. [SCOPE BOUNDARY] Teste DAG-router stale por FIX C não-commitado**
- **Encontrado durante:** Task 2 (verificação de `bun test src/cognition/`).
- **Issue:** o teste "gather:oak_log SEM cooldown + LLM action=explore → roteador DAG vence (dig)" em `nodes.test.ts` falha. Causa: a árvore de trabalho tinha mudanças NÃO-COMMITADAS (status `M` no início da sessão) em `nodes.ts`/`nodes.test.ts` implementando "FIX C" da sessão de debug `dag-router-ignores-explore` (status `verifying`), que muda o contrato do escape do roteador DAG. O teste "SEM cooldown" afirma o comportamento ANTIGO.
- **Prova de não-regressão:** revertendo só `states.ts` (12-02) o teste segue falhando; revertendo todo o FIX C ele passa. Os commits 12-02 foram feitos ISOLADOS de FIX C e estão 100% verdes (`bun test src/cognition/` → 167 pass / 0 fail; `tsc --noEmit` limpo).
- **Ação:** registrado em `deferred-items.md`. NÃO corrigido — é trabalho da sessão `dag-router-ignores-explore`. FIX C permanece na árvore de trabalho como mudança não-commitada, preservado para a sessão de debug concluir.

Fora isto: plano executado exatamente como escrito.

## Known Stubs
None. A skill `build` é totalmente implementada (Plan 01) e agora registrada+roteada. O que falta é GERAR os goals `build:*` — isso é o escopo explícito do Plan 03 (bridge need→build:shelter + player-request), não um stub.

## Next Phase Readiness (handoff para Plan 03)
- **Falta GERAR os goals `build:*`.** A infra de execução está completa: registrar `build:shelter` como `holder.currentGoal` faz o loop executar a construção determinística. O Plan 03 só precisa do canal que PRODUZ esse goal:
  - **Bridge de need:** quando o need de abrigo/segurança dispara (noite/cornered), gerar `build:shelter` — espelha a ponte need→DAG da Fase 10 (`pickTechTarget`/`resolveDag`), mas para building.
  - **Player-request:** pedido direto de jogador ("construa uma torre") → goal `build:tower` com condição-de-saída (modo assistente, decisão do milestone).
- `build({tipo:'shelter'})` usa `origin=floor(bot.position)` (a casca fecha ao redor do bot) e `dims=config.buildShelterDims` — confirmado no Plan 01.

## Self-Check: PASSED

- Arquivos verificados: src/skills/index.ts, src/cognition/nodes.ts, src/cognition/states.ts, src/cognition/nodes.build.test.ts, 12-02-SUMMARY.md — todos presentes
- Commits verificados: 78dc3bd, 4403b46 — ambos presentes em git log
- Verificações do plano: build suites 19 pass/0 fail; G-01 intacto (grep=1); isStub('building') vazio; STUB_STATES=['fighting']; tsc --noEmit limpo

---
*Phase: 12-building-deliberado*
*Completed: 2026-06-22*
