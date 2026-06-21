---
phase: 09-placement-crafting-smelting-grounded
plan: 01
subsystem: skills + grounding
tags: [placement, grounding, config, poi, tdd]
requires:
  - "src/grounding/types.ts (SkillResult)"
  - "src/skills/executor.ts (executeWithSafety)"
  - "src/grounding/capture.ts (inventoryDelta)"
  - "src/config.ts"
provides:
  - "placeBlockSafe — wrapper grounded de bot.placeBlock (outcome de blockAt, engole timeout)"
  - "getRefAndFace — helper puro ref+face para colocação"
  - "placeBlock + placeBlockSchema + placeBlockTool (skill 1ª classe, auto-wrap executeWithSafety)"
  - "evaluateCraft / evaluateSmelt / evaluateEquip (avaliadores puros, D-18/D-19/D-20)"
  - "PlaceType += 'station' (D-14)"
  - "config: placeTimeoutMs, placeRetries, smeltUpdateTimeoutMs, smeltTimeoutMs (com validação)"
affects:
  - "src/grounding/evaluate.ts"
  - "src/memory/persistence.ts"
  - "src/config.ts"
tech-stack:
  added: []
  patterns:
    - "Grounding por verdade-do-mundo: outcome deriva de bot.blockAt(alvo), nunca da Promise (D-01)"
    - "Swallow seletivo do falso-negativo de timeout do blockUpdate (Pitfall 1)"
    - "Skill 1ª classe auto-embrulha executeWithSafety (padrão dig.ts)"
key-files:
  created:
    - "src/skills/placeBlock.ts"
    - "src/skills/placeBlock.test.ts"
  modified:
    - "src/grounding/evaluate.ts"
    - "src/grounding/evaluate.test.ts"
    - "src/memory/persistence.ts"
    - "src/config.ts"
decisions:
  - "placeBlockSafe deriva o outcome de bot.blockAt(alvo): timeout do blockUpdate vira success (falso-negativo) e não falha"
  - "getRefAndFace prefere a face de BAIXO (ref acima do alvo) — caso tampar-teto do shelter cavar-e-tampar"
  - "evaluateSmelt delega a evaluateCraft (mesma forma numérica); observed conta só o ganho do alvo, delta preserva consumos"
  - "config.placeRetries fica RESERVADO (default 0); corpo do retry NÃO implementado (D-04, gap intencional)"
metrics:
  duration_min: 6
  tasks: 2
  files: 6
  tests_added: 16
  completed: 2026-06-21
---

# Phase 9 Plan 1: Placement/Grounding Foundation Summary

Fundação da Fase 9 entregue: o primitivo `placeBlock` robusto (grounded por `bot.blockAt`, engole o
falso-negativo de timeout do `blockUpdate`), os três avaliadores puros `evaluateCraft`/`evaluateSmelt`/
`evaluateEquip` (D-18/D-19/D-20), o tipo de POI `'station'` (D-14) e os 4 novos timeouts de config com
validação de range. Nenhuma skill nova registrada ainda — o registro fica para o Plano 03.

## What Was Built

### Task 1 — `src/skills/placeBlock.ts` (+ test)
- **`getRefAndFace(bot, target)`** (puro): varre as 6 faces (face de baixo primeiro), aceita o primeiro
  vizinho sólido contra o qual encostar quando o alvo está livre; retorna `{ ref, face: -faceVector }`
  ou `null`. Normaliza o `-0` do JS para `0`.
- **`placeBlockSafe(bot, ref, face, item, target)`**: equipa o bloco (D-02 — placeBlock não equipa
  sozinho), chama `bot.placeBlock` num try/catch que **engole qualquer throw**, e deriva o outcome de
  `bot.blockAt(target)`. Timeout = falso-negativo → `success`; `No block has been placed` + alvo livre →
  `partial`; resolveu mas mundo intacto → `no_effect`.
- **`placeBlock(bot, rawParams)`**: skill de 1ª classe que extrai o signal, valida o schema, checa
  inventário/idempotência/ref, e auto-embrulha `placeBlockSafe` em `executeWithSafety` (timeout/abort/
  delay gaussiano).
- **`PlaceBlockSchema` + `placeBlockTool`** exportados.

### Task 2 — avaliadores + POI + config
- **`evaluateCraft`/`evaluateSmelt`/`evaluateEquip`** em `src/grounding/evaluate.ts` (puros, sem mock de
  bot). craft/smelt classificam pelo ganho do item-alvo no delta; equip é LOCAL (booleano equipado).
- **`PlaceType`** em `src/memory/persistence.ts` ganhou `'station'` (D-14).
- **config.ts**: `placeTimeoutMs` (6000), `placeRetries` (0, reservado), `smeltUpdateTimeoutMs` (12000),
  `smeltTimeoutMs` (15000) + bloco de validação de range que não quebra o boot.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Normalização de `-0` no faceVector de getRefAndFace**
- **Found during:** Task 1 (teste "prefere face de baixo" e "vizinho sólido")
- **Issue:** `-fv[0]` produz `-0` em JS para componentes zero; `expect(...).toEqual({x:0,...})` distingue
  `0` de `-0` e falhava. Funcionalmente idêntico, mas ruído no contrato.
- **Fix:** `makeVec(-fv[0] || 0, -fv[1] || 0, -fv[2] || 0)` — normaliza `-0` para `0` na fonte (callers
  nunca recebem `-0`).
- **Files modified:** src/skills/placeBlock.ts
- **Commit:** 301902d

## Known Stubs

**`config.placeRetries` (default 0) — RESERVADO, corpo do retry não implementado (D-04, intencional).**
- **File:** src/config.ts
- **Reason:** O campo existe para fase futura; o loop de retry em `placeBlockSafe` NÃO é fiado nesta
  fase (só o guarda de idempotência). Gap rastreável, condicionado a teste ao vivo mostrar necessidade
  (CONTEXT.md > Deferred). Não bloqueia o objetivo do plano.

## Verification

- `bun test src/skills/placeBlock.test.ts src/grounding/evaluate.test.ts` → 24 pass, 0 fail.
- Teste do falso-negativo do timeout retorna `success` (protege o critério #1 da fase).
- `bunx tsc --noEmit` → exit 0 (PlaceType 'station' e config sem regressão de tipo).
- `bun test` global → 393 pass, 1 skip, 0 fail (sem regressões).
- `import('./src/config.ts')` carrega e imprime os 4 timeouts (6000/0/12000/15000) sem lançar.

## Self-Check: PASSED
