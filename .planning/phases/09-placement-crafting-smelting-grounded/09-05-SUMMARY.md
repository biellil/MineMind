---
phase: 09-placement-crafting-smelting-grounded
plan: 05
subsystem: cognition
tags: [gap-closure, g-01, action-enum, dispatch, behavioral-wiring, tdd]
requires:
  - "src/llm/schemas.ts (ActionDecisionSchema — enum FECHADO de ação)"
  - "src/cognition/nodes.ts (execute node: dispatch state→skill + grounding/memória reusados)"
  - "src/skills/index.ts (skillRegistry com craft/smelt/equip/placeBlock — Plano 03)"
  - "src/skills/{craft,smelt,equip,placeBlock}.ts (param-schemas das 4 skills — Planos 01/03/04)"
provides:
  - "ActionDecisionSchema estendido: action aceita craft/smelt/equip/place (continua FECHADO)"
  - "actionToCognitiveState mapeia os 4 verbos novos → 'building'"
  - "branch de dispatch state==='building' no execute: resolve verbo + monta params físicos do target"
  - "montagem de params com spread (...JSON.parse(target)) para os 4 verbos novos"
  - "src/cognition/nodes.test.ts — cobertura agent-level do dispatch dos 4 verbos + memória grounded"
affects:
  - "src/llm/schemas.ts"
  - "src/cognition/nodes.ts"
tech-stack:
  added: []
  patterns:
    - "Estado cognitivo agregado ('building') resolve o verbo exato no execute via fresh.decision.action — granularidade de estado fica livre p/ a Phase 10 refinar sem mexer no dispatch"
    - "target de alto nível (string) parseado por verbo no execute → params físicos (D-10/Pitfall): LLM nunca monta a chamada física"
    - "Degradação para sem-ação (Core Value): target inválido NÃO seta skill, o tick continua via actionFinished sem lançar"
    - "Monkeypatch pontual do skillRegistry no teste (sem mock.module, que vaza global no bun)"
key-files:
  created:
    - "src/cognition/nodes.test.ts"
  modified:
    - "src/llm/schemas.ts"
    - "src/cognition/nodes.ts"
    - "src/llm/schemas.test.ts"
decisions:
  - "craft/smelt/equip/place mapeiam para o estado agregado 'building'; o verbo exato é re-resolvido no execute a partir de fresh.decision.action (não do state) — mantém o grafo sem novos estados e a Phase 10 livre p/ refinar"
  - "A chave do registry para colocar bloco é 'placeBlock' (não 'place') — o verbo do enum é 'place' mas o dispatch traduz para a skill registrada"
  - "Montagem de params: dig recebe target string cru, navigate recebe {target:{x,y,z}}, os 4 verbos novos recebem o objeto completo via spread (...JSON.parse(target)) — itemName/count, oreName/count, itemName/destination?, target/itemName"
  - "target inválido (item vazio, place sem @x,y,z) degrada para sem-ação sem lançar — o caminho de grounding/memória/anti-repetição/preempção é reusado sem alteração"
  - "BOUNDARY Phase 10: nenhuma lógica de 'o que craftar/fundir' por needs/tech-tree — verbo+alvo vêm prontos do LLM (verificado por grep: 0 ocorrências de needs/tech-tree no diff)"
metrics:
  duration_min: 5
  tasks: 3
  files: 4
  completed: 2026-06-21
---

# Phase 9 Plan 05: Fiação Comportamental de craft/smelt/equip/place (G-01) Summary

Abre a superfície de decisão do agente (enum de ação + target por verbo) e fia os 4 verbos da Fase 9 ao dispatch do execute node, reusando o caminho de grounding/memória existente — fecha a lacuna G-01 no nível COMPORTAMENTAL (o agente crafta/funde/equipa/coloca quando o LLM escolhe).

## What Was Built

**Task 1 — Enum de ação estendido (FECHADO):** `ActionDecisionSchema.action` passou de 5 para 9 verbos (`+craft/smelt/equip/place`), mantendo o `z.enum([...])` fechado (LLM-02/D-10). `target` permanece `z.string().max(64).optional()` — os params físicos continuam montados na cognição, não pelo LLM. `.describe()` de `action` e `target` documenta o formato por verbo (contrato de parse da Task 2): `craft`=`item` ou `item:N`, `smelt`=`minério`, `equip`=`item` ou `item@slot`, `place`=`nome @ x,y,z`.

**Task 2 — Dispatch fiado no execute node:** `actionToCognitiveState` mapeia os 4 verbos novos para o estado agregado `'building'`. Um branch novo (`state === 'building' && fresh`) resolve o VERBO exato de `fresh.decision.action` e monta os params físicos do `llmTarget`: parse de `item:N` (count clampado 1–64), `item@slot` (destination opcional), e `nome @ x,y,z` (place exige posição parseável, senão degrada para sem-ação). A montagem de params ganhou um terceiro ramo: `...JSON.parse(target)` (objeto completo) para os 4 verbos novos, mantendo `dig` (string crua) e `navigate` (`{target:{x,y,z}}`) intactos. Todo o caminho de grounding/memória/anti-repetição/preempção foi reusado sem alteração.

**Task 3 — Teste agent-level:** `src/cognition/nodes.test.ts` (novo) prova, chamando `execute` diretamente com um holder/snapshot mínimos e monkeypatch pontual do `skillRegistry`: cada verbo despacha a skill certa com os params físicos corretos; a memória grounded deriva do `SkillResult` (`no_effect`/`observed=0` → `result='failure'`); e `place` sem posição não despacha (skill=null em `actionFinished`, sem MemEvent action).

## How It Works

```
LLM decide {action:'craft', target:'wooden_pickaxe:1'}  (enum FECHADO valida)
        │
analyze: actionToCognitiveState('craft') → cogState='building'
        │
execute: state==='building' && fresh
        │ verb = fresh.decision.action = 'craft'
        │ raw = 'wooden_pickaxe:1' → {itemName:'wooden_pickaxe', count:1}
        │ skill='craft', target=JSON.stringify(params)
        │
params = {...JSON.parse(target), signal}  → skillRegistry['craft'](bot, params)
        │
result.outcome → holder.lastObservedDelta + recordEvent (grounded, REUSADO)
```

O LLM continua "diretor criativo" (escolhe verbo + alvo de alto nível); a mecânica física continua nas skills (D-10). O estado `'building'` agrega os 4 verbos para não criar estados novos no grafo — o verbo exato é re-resolvido no execute.

## Deviations from Plan

None - plano executado exatamente como escrito.

Nota: a Task 2 era marcada `tdd="true"` mas o arquivo de teste alvo (`nodes.test.ts`) é o artefato da Task 3. Segui o ciclo RED→GREEN escrevendo `nodes.test.ts` ANTES da implementação do dispatch da Task 2 (RED confirmado: 7 fail), implementando o dispatch (GREEN: 8 pass), e commitando a implementação (Task 2) e o teste (Task 3) separadamente. Isto honra tanto o TDD quanto a estrutura de tarefas do plano — não é um desvio de escopo.

## Verification Results

- `bunx tsc --noEmit` → exit 0 (sem regressão de tipo após estender enum e dispatch)
- `bun test src/cognition/nodes.test.ts` → 8 pass / 0 fail (dispatch dos 4 verbos + memória grounded)
- `bun test src/llm/schemas.test.ts` → 19 pass / 0 fail (enum estendido + ainda fechado)
- `bun test` (suite global) → 432 pass / 0 fail / 1 skip (aditivo; não tocou dig/navigate/socializing)
- grep `'place'` no enum de schemas.ts → presente (enum estendido e ainda fechado)
- grep `skill = 'placeBlock'` em nodes.ts → presente (dispatch do place fiado)
- grep `...JSON.parse(target)` em nodes.ts → presente (montagem de params dos verbos novos)
- grep `needs|tech-tree|dependenc` no diff → 0 (boundary da Phase 10 respeitada)

## Self-Check: PASSED
