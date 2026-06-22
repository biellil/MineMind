---
phase: 12-building-deliberado
plan: 03
subsystem: cognition
tags: [building, shelter-bridge, player-request, observe-node, deliberate-goal]

# Dependency graph
requires:
  - phase: 12-building-deliberado (Plan 02)
    provides: "roteador build:* (buildGoalToSkillParams/BUILD_PREFIXES) + skill build registrada — consome os goals build:* que este plano PRODUZ"
  - phase: 12-building-deliberado (Plan 01)
    provides: "skill build (shelter via origin=floor(bot.position), dims=config.buildShelterDims) + runBlueprint idempotente (retomada por re-seleção)"
  - phase: 10-tech-tree (ponte Fase 10)
    provides: "MOLDE da ponte determinística no observe (resources need → resolveDag) espelhado pela ponte de abrigo"
  - phase: 08-system1-survival
    provides: "survivalCritical (reflexo de emergência) — a ponte cede precedência a ele (D-15), shelter.ts intocado"
provides:
  - "Ponte de abrigo no observe: noite (!snapshot.status.isDay) + exposto (sem teto via bot.blockAt) + seguro → holder.currentGoal = build:shelter"
  - "shouldBuildShelter — condição PURA da ponte (testável sem bot/holder)"
  - "kind 'build' em SUPPORTED_REQUEST_KINDS + detectRequestKind exportada + detectBuildSub + makePlayerRequestGoal emitindo build:<sub> roteável"
affects: [building, sobrevivencia, modo-assistente]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bridge isolado no observe (menor blast radius): need de abrigo vira goal SEM tocar o contrato stub shelter/social do módulo motivation (Open Question 1)"
    - "Noite derivada do booleano normalizado do snapshot (!isDay), NUNCA threshold de tick contra timeOfDay (0.0–1.0)"
    - "Retomada por idempotência: sem subsistema de pendência — a ponte re-seleciona build:shelter a cada tick ainda-noite+exposto; runBlueprint pula blocos já colocados"

key-files:
  created:
    - src/cognition/nodes.shelter-bridge.test.ts
  modified:
    - src/cognition/nodes.ts
    - src/chat/conversation.ts
    - src/chat/conversation.test.ts

key-decisions:
  - "Open Question 1 → BRIDGE: a ativação de abrigo é um bridge isolado no observe que define holder.currentGoal direto; o need stub shelter do módulo motivation permanece intocado (needs/goals/types byte-for-byte)"
  - "Open Question 2 → gate ASSISTANT mantido: pedido de jogador só vira goal build:<sub> em disposition ASSISTANT; shouldRespond inalterado (a IA conversa nos 2 modos, só a GERAÇÃO de goal é gated)"
  - "Gatilho fino noite = !snapshot.status.isDay (escala normalizada); exposto = sem bloco sólido na coluna dy 2..6 acima da cabeça via bot.blockAt; sonda de teto só roda quando noite já confirmada (evita bot.blockAt à toa)"
  - "Precedência do reflexo Fase 8 (D-15): a ponte NÃO ativa sob survivalCritical; o abrigo deliberado é PROATIVO e cede a vida-crítica via a preempção generalizada já existente"

requirements-completed: [BUILD-02, BUILD-03]

# Metrics
duration: 6min
completed: 2026-06-22
---

# Phase 12 Plan 03: Loop de Abrigo + Pedido de Building Summary

**O building deliberado ganhou seus dois PRODUTORES de goal `build:*`: (1) uma ponte isolada no observe node que, à noite (`!snapshot.status.isDay`) e com o bot exposto (sem teto sólido, via `bot.blockAt`), promove autonomamente um goal `build:shelter` sem tocar o contrato stub do módulo motivation; (2) o kind `build` no canal conversacional, que transforma "constrói um abrigo/parede/torre" em um goal `build:<sub>` roteável em modo ASSISTANT. Ambos alimentam o roteador determinístico do Plan 02 → skill build do Plan 01.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-06-22T21:05:39Z
- **Completed:** 2026-06-22T21:11:01Z
- **Tasks:** 2
- **Files modified:** 4 (1 criado, 3 modificados)

## Accomplishments
- **Ponte de abrigo (SC1):** no observe, após a ponte Fase 10 e antes de `enteredIdle`, a condição noite+exposto+seguro promove `build:shelter` como `holder.currentGoal`. O roteador `build:*` (Plan 02) resolve para `build({tipo:'shelter'})` e o `runBlueprint` (Plan 01) fecha a casca ao redor do bot.
- **shouldBuildShelter** extraída como helper PURO (recebe `isNight` JÁ derivado) — a decisão é testável sem bot/holder/provider; 6 casos cobertos.
- **Sonda de teto barata:** `bot.blockAt` na coluna `dy 2..6` só roda quando `isNight && !survivalCritical` já é verdade — evita varredura de blocos à toa todo tick; `try/catch` degrada para não-exposto se o corpo do bot não existir (mock/morte).
- **kind 'build' (SC2):** `SUPPORTED_REQUEST_KINDS` (antes fechado) ganhou `'build'`; `detectRequestKind` foi exportada e estendida com keywords pt/en (`constr*`, `abrigo`, `parede`, `muro`, `torre`, `estação`, `shelter`, `wall`, `tower`, `station`); `detectBuildSub` resolve o sub-tipo e `makePlayerRequestGoal` emite o id roteável `build:<sub>`.
- **Cadeia completa verificável:** ponte observe → `build:shelter` → roteador build:* (Plan 02) → `build({tipo:'shelter'})` (Plan 01); pedido de jogador → `build:<sub>` → mesma cadeia.

## Gatilho fino escolhido (noite + exposto)
- **Noite = `!snapshot.status.isDay`** — booleano JÁ pronto do snapshot. CRÍTICO: `snapshot.status.timeOfDay` é NORMALIZADO 0.0–1.0 (NÃO o tick Minecraft 0–24000); a ponte NUNCA compara o snapshot contra 13000–23000 (seria sempre falso → SC1 falharia em silêncio). Nenhum threshold de tick existe no caminho da ponte.
- **Exposto = sem bloco sólido** numa coluna de 5 blocos (`dy 2..6`) acima da cabeça do bot via `bot.blockAt` (ignora `air`/`cave_air`).

## Decisões de Open Questions
- **Open Question 1 (need stub vs bridge) → BRIDGE.** A ativação fica isolada no observe e escreve `holder.currentGoal` direto. `src/motivation/needs.ts`, `goals.ts`, `types.ts` e `src/skills/shelter.ts` permanecem **byte-for-byte intactos** (`git diff --quiet` exit 0) — menor blast radius, contrato stub preservado (Pitfall 5).
- **Open Question 2 (gate de geração de goal) → gate ASSISTANT mantido.** Pedido de jogador só vira goal em `holder.disposition === 'ASSISTANT'`; `shouldRespond` não foi tocado (a IA conversa nos 2 modos; só a geração de goal é gated).

## Task Commits

1. **Task 1: Ponte de abrigo no observe (shouldBuildShelter + bridge + teste)** — `0aadf24` (feat)
2. **Task 2: kind 'build' no canal de pedido (SUPPORTED_REQUEST_KINDS + detectRequestKind/detectBuildSub/makePlayerRequestGoal)** — `6a56165` (feat)

## Files Created/Modified
- `src/cognition/nodes.ts` — `shouldBuildShelter` (helper puro) + bridge de abrigo no observe (após `=== Fim da ponte Fase 10 ===`, antes de `enteredIdle`)
- `src/cognition/nodes.shelter-bridge.test.ts` — 6 casos de `shouldBuildShelter` (noite+exposto→true; dia→false; com-teto→false; survivalCritical→false; já-build→false; goal não-build não bloqueia)
- `src/chat/conversation.ts` — `'build'` em `SUPPORTED_REQUEST_KINDS`; `detectRequestKind` exportada + keywords build; `detectBuildSub`; `makePlayerRequestGoal(kind, now, message)` emitindo `build:<sub>`
- `src/chat/conversation.test.ts` — 6 testes novos (detectRequestKind build pt/en, build:shelter em ASSISTANT, sem goal em AUTONOMOUS) + 2 testes existentes atualizados para o conjunto fechado de 4 kinds

## Integração sem quebrar o estado atual de nodes.ts
A ponte foi inserida **entre** o fim da ponte Fase 10 e o cálculo de `enteredIdle`, sem tocar:
- O **FIX C escape block** do observe (lê `holder.llmDecision`, limpa sub-goals DAG em explore/navigate fresco) — roda ANTES da ponte de abrigo, intocado.
- Os roteadores **build:\*** e **DAG** no execute — intocados.
- O **dispatch G-01** (`state === 'building' && fresh`) — `grep -c` = 1 (intacto, D-14).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Testes pré-existentes de conversation quebrariam com o novo kind 'build'**
- **Found during:** Task 2
- **Issue:** o teste "pedido NÃO suportado" usava a mensagem `'constrói um castelo épico'`, que agora casa o regex de building (`constr\w*`) e retornaria `'build'` — quebrando a asserção de "sem objetivo". O teste do conjunto fechado também afirmava só `gather/follow/navigate`.
- **Fix:** mensagem do teste "NÃO suportado" trocada para uma sem keyword de kind (`'que dia bonito hoje, né?'`); asserção do conjunto fechado atualizada para incluir `'build'`. Ambos são consequência direta e esperada da extensão deste plano, não regressão.
- **Files modified:** src/chat/conversation.test.ts
- **Commit:** 6a56165

## Known Stubs
None. As duas pontes produzem goals `build:*` reais consumidos pela cadeia roteador→builder já completa (Plans 01/02). O need stub `shelter` do módulo motivation permanece stub DE PROPÓSITO (Open Question 1 resolvida via bridge) — não é um stub deste plano, é o contrato preservado.

## Estado final da Fase 12
- **Cadeia completa:** ponte observe (abrigo) **e** canal conversacional (pedido) → goal `build:<sub>` → roteador determinístico build:* (Plan 02) → `build({tipo})` (Plan 01) → `runBlueprint` idempotente fecha a estrutura.
- **SC1** (abrigo funcional ativado por need) e **SC2** (estrutura autônoma sob pedido) cobertos por unit tests.
- **SC3** (pacing/bounds) é herdado dos Plans 01/02 (pacing gaussiano, abort entre blocos, idempotência); a validação ao vivo é soak (não-bloqueante).
- Precedência do reflexo de emergência da Fase 8 mantida (D-11/D-15): a ponte não ativa sob `survivalCritical`.

## Verificação
- `bun test src/cognition/ src/chat/ src/skills/builder.test.ts src/skills/blueprints.test.ts` → **217 pass / 0 fail**
- `bunx tsc --noEmit` → exit 0
- `git diff --quiet src/skills/shelter.ts src/motivation/needs.ts src/motivation/goals.ts src/motivation/types.ts` → exit 0 (D-11/Pitfall 5: reflexo e contrato stub intactos)
- `grep -c "state === 'building' && fresh" src/cognition/nodes.ts` → 1 (G-01 intacto, D-14)

## Self-Check: PASSED

- Arquivos verificados: src/cognition/nodes.ts, src/cognition/nodes.shelter-bridge.test.ts, src/chat/conversation.ts, src/chat/conversation.test.ts, 12-03-SUMMARY.md — todos presentes
- Commits verificados: 0aadf24, 6a56165 — ambos presentes em git log

---
*Phase: 12-building-deliberado*
*Completed: 2026-06-22*
