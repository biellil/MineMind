---
phase: 12-building-deliberado
verified: 2026-06-22T00:00:00Z
status: human_needed
score: 11/11 must-haves verified (automated); SC3 live-soak pending human
human_verification:
  - test: "Rodar o bot ao vivo à noite, exposto, em servidor Minecraft — confirmar que constrói um abrigo 3x3x3 que fecha de verdade (sem buracos, sem auto-sufocar)"
    expected: "blockAt ao redor do bot confirma casca oca completa (6 lados); bot não sufoca; pacing visível entre blocos"
    why_human: "SC1/SC3 exigem mundo Minecraft ao vivo (mineflayer + servidor); placeBlock/pathfinder real não são exercitados pelos unit tests com mock-bot"
  - test: "Pedir 'constrói uma parede/torre/estação' em ASSISTANT no chat in-game e observar a estrutura sendo erguida"
    expected: "Estrutura simples surge no mundo respeitando pacing anti-cheat; sem OOM em soak prolongado"
    why_human: "SC2/SC3 — comportamento ao vivo + soak (memória/bounds do pathfinder) só observável com o processo rodando contra um servidor"
---

# Phase 12: Building Deliberado Verification Report

**Phase Goal:** O agente implementa o estado `building` real (hoje stub) além do abrigo de emergência reflexo: constrói um abrigo funcional e estruturas simples (parede/torre/posicionar estação), reusando o primitivo `placeBlock` robusto da Fase 9.
**Verified:** 2026-06-22
**Status:** human_needed (todos os checks automáticos verdes; SC3 live-soak é validação ao vivo)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (de must_haves dos 3 plans + Success Criteria do ROADMAP)

| #   | Truth (origem)                                                                                   | Status     | Evidence |
| --- | ------------------------------------------------------------------------------------------------ | ---------- | -------- |
| 1   | genShelter fecha TODOS os 6 vizinhos da célula (casca oca, sem buraco) — SC1 base (12-01)         | ✓ VERIFIED | `blueprints.ts:47-65` gera casca via `onBorder`; teste assert teto + exclusão do miolo. genWall/genTower presentes |
| 2   | runBlueprint idempotente: pula preenchidos, success só com cobertura total, senão partial (12-01) | ✓ VERIFIED | `builder.ts:138-153` outcome por `isFilled` real, não Promise; `builder.test.ts` cobre 3/3, idempotência |
| 3   | Lista ruim (sem face) degrada para partial/no_effect — nunca lança nem soterra (12-01)            | ✓ VERIFIED | `builder.ts:112` `getRefAndFace` null → `return false` (skip); `:142` sem material → continue; build() try/catch |
| 4   | AbortSignal abortado entre blocos para o loop antes do próximo place (12-01)                      | ✓ VERIFIED | `builder.ts:139` `if (signal?.aborted) break`; teste abort-entre-blocos verde |
| 5   | Retry idempotente (placeRetries) re-tenta checando isFilled antes, nunca recoloca (12-01)         | ✓ VERIFIED | `builder.ts:109-121` loop `attempt <= config.placeRetries`, isFilled-first; config.placeRetries=2 |
| 6   | build:shelter roteia DETERMINISTICAMENTE para a skill build, sem LLM, sem tocar G-01 (12-02)      | ✓ VERIFIED | `nodes.ts:128-133` buildGoalToSkillParams; router `:508` antes de gathering/G-01; G-01 `:559` intacto |
| 7   | A skill build é executável via skillRegistry['build'] (12-02)                                     | ✓ VERIFIED | `index.ts:17,33,55` build importado/re-exportado/registrado; `nodes.ts:682` dispatch comum |
| 8   | 'building' não é mais stub (só 'fighting' resta) sem quebrar G-01 craft/smelt/equip/place (12-02) | ✓ VERIFIED | `states.ts:10` STUB_STATES=['fighting']; nenhum `isStub('building')` no codebase; G-01 intacto |
| 9   | Noite + exposto → goal build:shelter autônomo (need → goal) — SC1 ativação (12-03)                | ✓ VERIFIED | `nodes.ts:377-389` ponte usa shouldBuildShelter(!isDay, exposed, ...); bridge test 5 casos verdes |
| 10  | Pedido 'constrói abrigo/parede/torre' vira goal build:<sub> em ASSISTANT — SC2 (12-03)            | ✓ VERIFIED | `conversation.ts:49,93-96` detectRequestKind+detectBuildSub; teste assert id==='build:shelter' |
| 11  | Abrigo deliberado NÃO preempta o reflexo Fase 8; bridge isolado, motivation stub intacto (12-03)  | ✓ VERIFIED | ponte gated por `!survivalCritical`; shelter.ts + needs/goals/types.ts UNMODIFIED (git) |

**Score:** 11/11 truths verified (automated)

### Required Artifacts

| Artifact                              | Expected                                          | Status     | Details |
| ------------------------------------- | ------------------------------------------------- | ---------- | ------- |
| `src/skills/blueprints.ts`            | genShelter/genWall/genTower/generateBlueprint     | ✓ VERIFIED | 130 linhas; 5 exports confirmados; casca oca determinística |
| `src/skills/builder.ts`               | runBlueprint + retry + grounding por cobertura    | ✓ VERIFIED | 239 linhas; runBlueprint/build/buildTool/BuildSchema/__builderDeps |
| `src/skills/builder.test.ts`          | Cobertura idempotência/partial/abort/retry        | ✓ VERIFIED | 143 linhas; bun:test, 7 cenários |
| `src/skills/placeBlock.ts`            | isFilled exportado                                | ✓ VERIFIED | `:52` `export function isFilled` |
| `src/config.ts`                       | placeRetries=2 + BUILD_* thresholds + validações  | ✓ VERIFIED | buildBlockDelayMeanMs/StdMs/buildTimeoutMs/dims + validações |
| `src/skills/index.ts`                 | build em skillRegistry + buildTool em toolRegistry| ✓ VERIFIED | import/re-export/registry confirmados |
| `src/cognition/nodes.ts`              | BUILD_PREFIXES + buildGoalToSkillParams + ponte   | ✓ VERIFIED | router :508 + shouldBuildShelter + ponte :377 |
| `src/cognition/states.ts`             | 'building' removido de STUB_STATES                | ✓ VERIFIED | `:10` só 'fighting' |
| `src/cognition/nodes.build.test.ts`   | teste do roteador build:*                         | ✓ VERIFIED | 35 linhas |
| `src/cognition/nodes.shelter-bridge.test.ts` | teste shouldBuildShelter                    | ✓ VERIFIED | 32 linhas |
| `src/chat/conversation.ts`            | kind 'build' + detectBuildSub + goal build:<sub>  | ✓ VERIFIED | gsd-tools all_passed; 191 linhas |
| `src/chat/conversation.test.ts`       | testes do kind build + gate ASSISTANT             | ✓ VERIFIED | 162 linhas; assert build:shelter id |

### Key Link Verification

| From                          | To                              | Via                                            | Status   | Details |
| ----------------------------- | ------------------------------- | ---------------------------------------------- | -------- | ------- |
| builder.ts                    | placeBlock.ts                   | import getRefAndFace+placeBlockSafe+isFilled   | ✓ WIRED  | `:20 from './placeBlock'` |
| builder.ts                    | executor.ts                     | gaussianDelay entre blocos (pacing D-16)       | ✓ WIRED  | `:22` import, `:146` uso |
| nodes.ts                      | skills/index.ts                 | skillRegistry['build'] via roteador build:*    | ✓ WIRED  | router :508 → dispatch :682 |
| nodes.ts                      | buildGoalToSkillParams          | execute roteia currentGoal.id 'build:'         | ✓ WIRED  | :509 routing |
| nodes.ts (observe)            | holder.currentGoal              | bridge noite+exposto → build:shelter           | ✓ WIRED  | :379-389 |
| conversation.ts               | holder.goals                    | detectRequestKind→makePlayerRequestGoal build: | ✓ WIRED  | :49,:188 push goal |

### Data-Flow Trace (Level 4)

A cadeia completa (SC1/SC2) é puramente determinística e foi traçada end-to-end:
- **Ativação por need (SC1):** observe bridge (`!isDay && exposed && !survivalCritical`) → `holder.currentGoal = build:shelter` → execute router build:* → `buildGoalToSkillParams` → `skillRegistry['build']` → `runBlueprint(generateBlueprint(genShelter))`. Dados reais (origin = `bot.entity.position`, dims = config). NÃO há retorno estático/hardcoded.
- **Ativação por pedido (SC2):** conversation `detectRequestKind→detectBuildSub` → `holder.goals.push({id:'build:<sub>'})` → mesma cadeia de router. Teste confirma `goal.id === 'build:shelter'`.

Status: ✓ FLOWING (origin/dims reais; outcome derivado de `bot.blockAt` via isFilled, nunca de Promise resolution).

### Behavioral Spot-Checks

| Behavior                                        | Command                              | Result            | Status |
| ----------------------------------------------- | ------------------------------------ | ----------------- | ------ |
| Suíte de testes da Fase 12 (5 arquivos)         | bun test (blueprints/builder/build/bridge/conversation) | 43 pass / 0 fail | ✓ PASS |
| Typecheck do projeto                            | bunx tsc --noEmit                    | exit 0, 0 erros   | ✓ PASS |
| skill build registrada + roteável               | grep registry + router               | build presente    | ✓ PASS |
| Abrigo real em servidor (placeBlock ao vivo)    | (requer servidor + bot rodando)      | —                 | ? SKIP |

### Requirements Coverage

| Requirement | Source Plan      | Description                                                              | Status      | Evidence |
| ----------- | ---------------- | ----------------------------------------------------------------------- | ----------- | -------- |
| BUILD-02    | 12-01,02,03      | Abrigo funcional (estado building real, além do reflexo de emergência)  | ✓ SATISFIED | genShelter full-seal + ponte noite+exposto + 'building' fora de STUB_STATES |
| BUILD-03    | 12-01,02,03      | Estruturas simples (parede/torre/posicionar estação)                    | ✓ SATISFIED | genWall/genTower + build station via ensureStation + kind build no chat |

Sem requisitos ORPHANED: REQUIREMENTS.md mapeia apenas BUILD-02/03 à Phase 12, ambos reivindicados pelos 3 plans. (BUILD-01 → Phase 9, fora de escopo.)

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (nenhum) | — | — | — | Nenhum TODO/FIXME/placeholder/stub nas implementações da Fase 12 |

Nota: `'fighting'` permanece em STUB_STATES por design (Fase 13) — não é anti-pattern desta fase.

### Human Verification Required

Os checks automáticos cobrem a corretude estrutural e determinística (geometria do abrigo, idempotência, roteamento, ativação). Restam validações que exigem o mundo ao vivo:

1. **Abrigo ao vivo (SC1 + SC3)** — rodar o bot à noite, exposto, contra um servidor Minecraft. Esperado: casca oca 3x3x3 que fecha de verdade (validado por blockAt ao redor), bot não sufoca, pacing visível entre blocos. Por que humano: placeBlock/pathfinder reais não são exercitados pelo mock-bot.

2. **Estrutura sob pedido + soak (SC2 + SC3)** — pedir 'constrói parede/torre/estação' em ASSISTANT in-game. Esperado: estrutura erguida com pacing anti-cheat, sem OOM em soak prolongado. Por que humano: comportamento ao vivo + memória/bounds só observáveis com o processo rodando.

### Gaps Summary

Nenhum gap bloqueante. Os 11 truths derivados dos must_haves dos 3 plans e dos Success Criteria do ROADMAP estão verificados no código: a cadeia ponte(observe)→roteador(execute)→builder→placeBlock está fiada e testada end-to-end por unit tests (43 verdes, tsc limpo). genShelter fecha os 6 lados deterministicamente (SC1 base), runBlueprint é grounded por cobertura real e idempotente, build:* roteia sem LLM e sem tocar o dispatch G-01 da Fase 9 (intacto), e tanto a ativação por need (noite+exposto) quanto por pedido de jogador (ASSISTANT) geram goals build:<sub> roteáveis. shelter.ts e o módulo motivation (needs/goals/types) permaneceram byte-for-byte intactos, preservando o reflexo de emergência da Fase 8 e o contrato stub.

O status é **human_needed** (não passed) porque SC3 — "navegação herda bounds do pathfinder + pacing anti-cheat + sem OOM em soak" — é explicitamente uma validação ao vivo (soak), conforme o próprio output do Plan 03 ("SC3 = pacing/bounds herdados, validação ao vivo é soak"). O pacing está implementado e tipado, mas o comportamento real só é observável com o bot rodando contra um servidor.

**Nota de contexto (não-gap da Fase 12):** o working tree contém mudanças não-commitadas em `src/cognition/nodes.ts`/`nodes.test.ts` referentes ao FIX C da sessão de debug `dag-router-ignores-explore` (já marcada `resolved`). Isso está documentado em `deferred-items.md` como PRÉ-EXISTENTE e de propriedade daquela sessão, não da Fase 12 — os commits da Fase 12 foram isolados e a suíte da fase está 100% verde.

---

_Verified: 2026-06-22_
_Verifier: Claude (gsd-verifier)_
