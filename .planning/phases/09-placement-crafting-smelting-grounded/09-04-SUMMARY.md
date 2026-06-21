---
phase: 09-placement-crafting-smelting-grounded
plan: 04
subsystem: skills
tags: [equip, tool-preflight, grounding-local, binary-category, tdd]
requires:
  - "src/grounding/evaluate.ts (evaluateEquip — criado no Plano 01)"
  - "src/grounding/types.ts (SkillResult)"
  - "src/skills/eat.ts (molde: extrair signal, find no inventário, grounding LOCAL)"
provides:
  - "equip — skill de 1ª classe grounded por estado LOCAL (heldItem/slot), não delta"
  - "selectToolFor(bot, category) — seletor binário por categoria, SEM ranking por tier (D-17)"
  - "matchesCategory + CATEGORY_PATTERNS (pickaxe/weapon/axe/shovel)"
  - "EquipSchema + equipTool (descriptor LangGraph — NÃO registrado ainda)"
  - "pré-flight de pickaxe em dig.ts (B2/D-16)"
  - "pré-flight de arma em attack.ts (B2/D-16)"
affects:
  - "src/skills/dig.ts"
  - "src/skills/attack.ts"
tech-stack:
  added: []
  patterns:
    - "Grounding LOCAL para equip: outcome via bot.heldItem/inventory.slots, nunca delta (D-19/Pitfall 2)"
    - "Heurística binária por categoria (regex de sufixo) sem tier — ranking é Fase 10 (D-17)"
    - "Pré-flight de ferramenta best-effort em try/catch: rede de segurança B2 que não altera o grounding"
key-files:
  created:
    - "src/skills/equip.ts"
    - "src/skills/equip.test.ts"
  modified:
    - "src/skills/dig.ts"
    - "src/skills/attack.ts"
decisions:
  - "equip é grounded por estado LOCAL (heldItem para mão, inventory.slots[5..8]/[45] para armadura/off-hand) — equipar não muda contagem de inventário, então delta seria sempre no_effect (D-19/Pitfall 2)"
  - "selectToolFor usa find() (primeiro match por categoria) — SEM ranking por tier; ponto de chamada estável p/ a Fase 10 trocar por seletor ranqueado (D-17)"
  - "pré-flight em dig/attack é best-effort (try/catch swallow): falha de equip não aborta a skill nem toca o outcome grounded (B2/D-16)"
metrics:
  duration_min: 4
  tasks: 2
  files: 4
  tests_added: 10
  completed: 2026-06-21
---

# Phase 9 Plan 4: equip 1ª classe + pré-flight selectToolFor Summary

`equip` virou verbo de 1ª classe grounded por estado LOCAL (D-19), e o pré-flight `selectToolFor`
foi fiado em `dig`/`attack` como rede de segurança B2 (o LLM local frequentemente omite equipar antes
de minerar/atacar). Seleção binária por categoria (D-17) — tem pickaxe? equipa; sword/axe? equipa —
SEM ranking por tier (isso é Fase 10).

## What Was Built

### Task 1 — `src/skills/equip.ts` (+ test, TDD)
- **`selectToolFor(bot, category)`** (binário, D-17): `bot.inventory.items().find(matchesCategory) ?? null`.
  Retorna o PRIMEIRO match na ordem do inventário — NÃO o melhor tier. `CATEGORY_PATTERNS` usa regex de
  sufixo: `pickaxe:/_pickaxe$/`, `weapon:/_(sword|axe)$/`, `axe:/_axe$/`, `shovel:/_shovel$/`.
- **`equip(bot, rawParams)`** (skill 1ª classe): extrai o signal antes do Zod, valida `EquipSchema`,
  acha o item no inventário (ausente → `no_effect`/reason `'item ausente'`), chama `bot.equip(item, dest)`
  num try/catch que **engole o throw** (D-12), e deriva o outcome da **verdade LOCAL** (D-19/Pitfall 2):
  `bot.heldItem?.name === itemName` para mão, `inventory.slots[45]` para off-hand, `inventory.slots[5..8]`
  para armadura. `evaluateEquip(!!equipped)` produz o `SkillResult`; reason do throw anexado se houve.
- **`EquipSchema`** (itemName + destination enum opcional, padrão hand) **+ `equipTool`** descriptor.
  NÃO registrado no index — o Plano 03 registra os 4 juntos.

### Task 2 — pré-flight em `dig.ts` e `attack.ts` (B2/D-16)
- **`dig.ts`**: importa `selectToolFor` de `./equip`; após `captureGroundState(before)` e antes do
  abort-listener/try, um pré-flight best-effort equipa `selectToolFor(bot,'pickaxe')` se o heldItem
  difere. `try/catch` swallow — NÃO altera assinatura, schema, nem o caminho grounded.
- **`attack.ts`**: importa `selectToolFor`; após o guard `if (!target)` e antes de `bot.attack(target)`,
  pré-flight best-effort de `selectToolFor(bot,'weapon')`. NÃO muda o retorno grounded (success/no_effect).

## Deviations from Plan

None — plano executado exatamente como escrito. Os mocks dos testes de dig/attack NÃO precisaram de
stubs extras de `heldItem`/`equip`: o mock de dig devolve `inventory.items()===[]` (selectToolFor → null,
sem equip) e o mock de attack não tem `inventory`, então `selectToolFor` lança e o `try/catch` best-effort
do pré-flight engole o erro sem afetar as asserções de outcome. Os 7 testes existentes seguem verdes sem
edição.

## Verification

- `bun test src/skills/equip.test.ts` → 10 pass, 0 fail (inclui o teste "no ranking by tier").
- `bun test src/skills/equip.test.ts src/skills/dig.test.ts src/skills/attack.test.ts` → 17 pass, 0 fail.
- `bunx tsc --noEmit` → exit 0 (sem regressão de tipo).
- equip reporta `success` quando `heldItem` muda e `no_effect` quando o estado LOCAL não muda
  (Pitfall 2 evitado — não usa delta de inventário; `equip.ts` NÃO contém `captureGroundState`).
- selectToolFor com `wooden_pickaxe` + `diamond_pickaxe` retorna `wooden_pickaxe` (primeiro match,
  sem tier — D-17 verificado).

## Self-Check: PASSED
