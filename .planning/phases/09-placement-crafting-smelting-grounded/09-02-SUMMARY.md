---
phase: 09-placement-crafting-smelting-grounded
plan: 02
subsystem: skills (survival/shelter)
tags: [placement, shelter, grounding, refactor, build-01, d-05]
requires:
  - "src/skills/placeBlock.ts (placeBlockSafe + getRefAndFace — Plano 01)"
  - "src/grounding/types.ts (SkillResult)"
provides:
  - "shelter refatorado consumindo placeBlockSafe/getRefAndFace (placeBlock UMA vez, D-05)"
affects:
  - "src/skills/shelter.ts"
  - "src/skills/shelter.test.ts"
tech-stack:
  added: []
  patterns:
    - "Skills de colocação reusam o wrapper robusto único placeBlockSafe (D-05/BUILD-01)"
    - "Grounding por cobertura real preservado: outcome do bloco 2 acima, não da Promise"
    - "Reason de falha herdado do SkillResult engolido pelo wrapper (não mais de throw cru)"
key-files:
  created: []
  modified:
    - "src/skills/shelter.ts"
    - "src/skills/shelter.test.ts"
decisions:
  - "shelter cavar-e-tampar usa getRefAndFace no topo (pos+2); pilar 1×1 usa belowRef+face para cima — ambos via placeBlockSafe"
  - "shelter captura pr.reason de placeBlockSafe (que engole o throw) para manter o diagnóstico de falha — o `threw` local quase nunca dispara agora"
  - "mock do teste ganhou vizinho sólido do topo (0,67,0) para o getRefAndFace encontrar uma face no branch cavar-e-tampar — sem mudar asserções de outcome"
metrics:
  duration_min: 5
  tasks: 1
  files: 2
  tests_added: 0
  completed: 2026-06-21
---

# Phase 9 Plan 2: Shelter consome placeBlockSafe (D-05) Summary

Refator isolado do abrigo de emergência (`src/skills/shelter.ts`) para consumir o wrapper robusto
`placeBlockSafe`/`getRefAndFace` do Plano 01 em vez das duas chamadas cruas `bot.placeBlock` —
cumprindo BUILD-01 ("placeBlock implementado UMA vez, compartilhado"). Os dois branches
(cavar-e-tampar / pilar 1×1), a guarda anti-lava e o grounding por cobertura real foram preservados;
os testes da Fase 7/8 do shelter revalidados verdes.

## What Was Built

### Task 1 — refator de `src/skills/shelter.ts` (D-05)
- **Import** de `placeBlockSafe, getRefAndFace` de `./placeBlock` no topo.
- **Branch CAVAR-E-TAMPAR:** a chamada crua `bot.placeBlock(headRef, makeVec(0,-1,0))` virou
  `getRefAndFace` no alvo de cobertura do topo (`pos.offset(0,2,0)`) → `placeBlockSafe(...)`. Se o
  `getRefAndFace` retornar `null` (sem vizinho sólido alcançável), segue ao grounding por cobertura
  que decide `partial` — sem lançar.
- **Branch PILAR 1×1:** preservada a mecânica do pulo (equip + lookAt + jump + espera 250ms + `finally`
  jump=false); só a chamada `bot.placeBlock(belowRef, makeVec(0,1,0))` virou
  `placeBlockSafe(bot, belowRef, makeVec(0,1,0), block, footTarget)`. O `placeBlockSafe` re-equipa o
  bloco internamente (idempotente com o equip do pulo).
- **Herança do swallow:** o abrigo agora herda o tratamento do falso-negativo de timeout do
  `blockUpdate` e a verificação por `blockAt` do wrapper — sem manter um placeBlock mínimo paralelo
  que diverge do robusto.
- **PRESERVADO INTACTO:** seleção do `block` (regex PLACEABLE), guarda anti-lava `UNSAFE_BELOW`/`canDig`,
  o `bot.dig(below1)` do cavar-e-tampar, o bloco de grounding por cobertura real (bloco 2 acima sólido →
  `success`, senão `partial`), o schema `ShelterSchema`, o `shelterTool` e a assinatura de `shelter`.
  `makeVec` mantido (ainda usado para o faceVector do pilar).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Critical functionality] Preservar o `reason` de falha de colocação após o swallow do wrapper**
- **Found during:** Task 1 (teste "placeBlock lança -> não vira fluxo de throw; partial e reason anexado")
- **Issue:** No código antigo, o throw de `bot.placeBlock` propagava ao `catch` do shelter e virava
  `reason`. Com o D-05, `placeBlockSafe` ENGOLE o throw e devolve o motivo no `SkillResult.reason` —
  então o `threw` local do shelter fica `null` e o `reason` final viraria `undefined`, quebrando a
  asserção `expect(r.reason).toBeDefined()` e perdendo o diagnóstico de falha ao vivo.
- **Fix:** Captura `pr.reason` de cada `placeBlockSafe` (quando `pr.outcome !== 'success'`) numa
  variável `placeReason`, usada como fallback no `reason` final (`threw` ainda tem prioridade para
  o raro throw local fora do wrapper). Mantém o diagnóstico de falha sem mudar nenhuma asserção de
  outcome.
- **Files modified:** src/skills/shelter.ts
- **Commit:** b945aa3

**2. [Rule 1 - Test mock] Vizinho sólido do topo no mock do teste cavar-e-tampar**
- **Found during:** Task 1 (teste "canDig=true -> cava-e-tampa")
- **Issue:** O mock tinha só `0,62,0`/`0,63,0` sólidos. Com o D-05, o branch cavar-e-tampar passa por
  `getRefAndFace(topTarget=0,66,0)`, que precisa de um vizinho sólido para retornar uma face. Sem
  vizinho, retornava `null` → `placeBlockSafe` não era chamado → o `coverAfter` do mock (que só dispara
  dentro de `bot.placeBlock`) nunca fiava a cobertura → outcome viraria `partial` em vez de `success`.
- **Fix:** Adicionado `'0,67,0': 'stone'` (vizinho acima do topo) ao mapa de blocks do teste — o
  `getRefAndFace` encontra a face, `placeBlockSafe` roda, `coverAfter` dispara, outcome `success`. O
  plano antecipava exatamente esse ajuste de mock ("SEM mudar as asserções de outcome").
- **Files modified:** src/skills/shelter.test.ts
- **Commit:** b945aa3

## Known Stubs

None.

## Parallel-execution note

Durante a execução (executor paralelo), apareceram modificações não-relacionadas em `src/skills/attack.ts`
e `src/skills/dig.ts` (pré-flight de equip via `selectToolFor` de `./equip`) — trabalho de um agente
irmão (Plano 03/04). Fora do escopo deste plano; NÃO foram staged nem commitados aqui. O commit deste
plano é isolado (apenas `shelter.ts` + `shelter.test.ts`).

## Verification

- `bun test src/skills/shelter.test.ts` → 6 pass, 0 fail (revalidação Fase 7/8 do shelter).
- `bun test` global → 403 pass, 1 skip, 0 fail (sem regressões; Plano 01 reportava 393 pass).
- `bunx tsc --noEmit` → exit 0 (sem regressão de tipo).
- Grep `bot.placeBlock(` em shelter.ts → 0 matches (nenhuma chamada crua resta).
- Marcadores de aceite confirmados: import do placeBlock, `placeBlockSafe(` nos dois branches,
  `UNSAFE_BELOW`, `above.name !== 'air'`, `setControlState('jump', true)`.

## Self-Check: PASSED
