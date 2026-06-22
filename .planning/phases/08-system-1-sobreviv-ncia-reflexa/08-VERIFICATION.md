---
phase: 08-system-1-sobreviv-ncia-reflexa
verified: 2026-06-22T00:00:00Z
status: passed
score: 6/6 must-haves verified
human_verification:
  - test: "Demonstração AO VIVO dos reflexos de sobrevivência em situação real (eat/flee/ambiental)"
    expected: "Com fome <= hungryThreshold o bot come ([reflex] eat success); com mob hostil no alcance graduado o bot preempta ('preemptando … (lifeCritical)') e foge/ataca; aproximando de lava/queda > fallDangerBlocks o bot recua via setGoal(null) sem andar para o perigo"
    why_human: "Requer servidor Minecraft + LM Studio rodando e a CRIAÇÃO de situações de gatilho em jogo (fome, spawn de mob, proximidade de lava/abismo). Nenhuma situação disparou os reflexos de sobrevivência na sessão de verificação ao vivo de 2026-06-22 — apenas o gate primário [reflect] (D-20) foi exercitado e confirmado. Cobertos por testes unitários (tabela-verdade do arbitrateReflex + skills), mas o comportamento físico em jogo permanece como UAT pendente."
---

# Phase 08: System 1 — Sobrevivência Reflexa Verification Report

**Phase Goal:** O agente sobrevive aos assassinos rápidos (fome, mob hostil, perigos ambientais) reagindo em sub-segundo por uma camada reflexa pura sem LLM, que tem precedência de execução física sobre a ação deliberada por preempção — sem bloquear a inferência single-flight.
**Verified:** 2026-06-22
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                                       | Status     | Evidence                                                                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | TriggerBus emite gatilhos lifeCritical (healthCritical/drowning/lavaAhead/fallAhead) por physicsTick edge-detection com histerese, sem flood | ✓ VERIFIED | `trigger-bus.ts:28-38` estende TriggerEvent; `:206-230` onPhysicsTick com histerese enter/exit (health/oxygen) e edge simples (lava/queda); `:208` null-safety `if (!bot.entity) return`; `:245` cleanup |
| 2   | O nó execute preempta para TODOS os gatilhos lifeCritical chamando setGoal(null) ANTES do abort (D-07)                                       | ✓ VERIFIED | `nodes.ts:58` `LIFE_CRITICAL_TRIGGERS` (5 gatilhos); `:439-449` fábrica de N listeners; `:444` `setGoal(null)` ANTES de `:445` `skillAbort.abort(trig)`; `:528` remoção de todos no finally               |
| 3   | O driver consulta arbitrateReflex e despacha a skill reflexa vencedora; reflexos idle não tocam o LLM                                        | ✓ VERIFIED | `loop.ts:454` `arbitrateReflex(buildReflexSensors(bot))`; `:455` `REFLEX_SKILL[decision.reflex]`; `:457` `runReflex(...)`; `arbitrateReflex` é função pura (reflex.ts importa só config)                  |
| 4   | O reflexo é registrado como MemEvent grounded (debounced/coalesced) pelo pipeline da Fase 7                                                  | ✓ VERIFIED | `loop.ts:127` debounce 3s por tipo via `lastReflexAt`; `:129-139` `recordEvent(holder, {type:'action', ...}, nowTs)` — mesma forma do execute node                                                       |
| 5   | O reflexo NUNCA chama o LLM nem toca inFlight — o [reflect] continua disparando (gate D-20)                                                  | ✓ VERIFIED | `runReflex` (`loop.ts:114-145`) usa só `skillRegistry`+`recordEvent`; nenhuma chamada a `maybeDeliberate`/`provider`/`inFlight`. Path `[reflect] reflexão executada` (`:415`) intacto, gated por `inFlight` |
| 6   | O [reflect] não regrediu (gate D-20) — confirmado AO VIVO                                                                                    | ✓ VERIFIED | Caminho de reflexão (`loop.ts:391-415`) preservado e isolado do dispatch reflexo; usuário confirmou AO VIVO em 2026-06-22 que `[reflect] reflexão executada` dispara após o System 1 (B1 não reapareceu)  |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact                       | Expected                                                  | Status     | Details                                                                                                                |
| ------------------------------ | --------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------- |
| `src/cognition/reflex.ts`      | arbitrateReflex (pura, winner-take-all)                   | ✓ VERIFIED | 89 linhas; `REFLEX_GUARDS` ordenado por gravidade; importa só `config`, nunca `Bot`; importado e usado em loop.ts      |
| `src/cognition/reflex.test.ts` | Cobertura de tabela-verdade do arbitrateReflex            | ✓ VERIFIED | 21 casos (`it/test`), 31 referências a arbitrateReflex/REFLEX_GUARDS/lifeCritical                                       |
| `src/cognition/trigger-bus.ts` | 4 gatilhos lifeCritical via physicsTick edge-detection    | ✓ VERIFIED | TriggerEvent estendido; onPhysicsTick com histerese; helpers isLavaAhead/fallDepthAhead null-safe; cleanup do listener |
| `src/cognition/nodes.ts`       | Preempção generalizada + setGoal(null)                    | ✓ VERIFIED | LIFE_CRITICAL_TRIGGERS + N listeners; setGoal(null) antes do abort; cleanup de todos no finally                        |
| `src/cognition/loop.ts`        | Fiação do System 1 (arbitrateReflex + dispatch + MemEvent) | ✓ VERIFIED | import arbitrateReflex/skillRegistry; buildReflexSensors + runReflex; triggerCfg estendido; debounce lastReflexAt      |
| `src/skills/{eat,flee,shelter,attack}.ts` | Skills reflexas registradas no skillRegistry   | ✓ VERIFIED | Os 4 arquivos existem e estão registrados em `skillRegistry` (`src/skills/index.ts:52-64`)                            |

### Key Link Verification

| From          | To                          | Via                          | Status   | Details                                                          |
| ------------- | --------------------------- | ---------------------------- | -------- | ---------------------------------------------------------------- |
| loop.ts       | reflex.ts                   | `import { arbitrateReflex }` | ✓ WIRED  | `loop.ts:29` import; `:454` chamada                              |
| nodes.ts      | bot.pathfinder.setGoal      | preempção forçada D-07       | ✓ WIRED  | `nodes.ts:444` `bot.pathfinder.setGoal(null)` antes do abort     |
| loop.ts       | src/skills/index.ts         | `skillRegistry[reflex]`      | ✓ WIRED  | `loop.ts:30` import; `:120` `skillRegistry[reflex]` em runReflex |
| loop.ts       | (driver dispatch site)      | `arbitrateReflex` no while   | ✓ WIRED  | `loop.ts:453-459` dispatch após makeParkPromise, gated por alive |

### Data-Flow Trace (Level 4)

| Artifact                | Data Variable          | Source                                | Produces Real Data | Status     |
| ----------------------- | ---------------------- | ------------------------------------- | ------------------ | ---------- |
| loop.ts (runReflex)     | ReflexSensors          | `buildReflexSensors(bot)` lê bot vivo | Sim (bot.food/health/oxygen/nearestEntity) | ✓ FLOWING |
| trigger-bus onPhysicsTick | bot.health/oxygenLevel | leitura direta do bot a ~20Hz         | Sim                | ✓ FLOWING  |
| nodes.ts preempção      | gatilhos do TriggerBus | `triggerBus.once(trig, fn)`           | Sim (emitidos pelo physicsTick) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior                                          | Command       | Result                       | Status |
| ------------------------------------------------- | ------------- | ---------------------------- | ------ |
| Suite completa verde (arbitragem + skills + loop) | `bun test`    | 455 pass, 1 skip, 0 fail     | ✓ PASS |
| arbitrateReflex tabela-verdade                    | reflex.test.ts | 21 casos passam              | ✓ PASS |
| Reflexos de sobrevivência ATUANDO em jogo         | (in-game)     | não exercitado na sessão viva | ? SKIP — ver Human Verification |

### Requirements Coverage

| Requirement | Source Plan | Description                                                       | Status      | Evidence                                                                                          |
| ----------- | ----------- | ---------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------- |
| SURV-01     | 08-04       | Come automaticamente antes de a fome causar dano (reflexo)        | ✓ SATISFIED | Guarda fome em reflex.ts:76 (lifeCritical=false → eat); skill eat registrada; dispatch idle no driver |
| SURV-02     | 08-04       | Detecta mob hostil e reage (foge/defende) em sub-segundo sem LLM  | ✓ SATISFIED | hostileNearby + isHostileThreat (D-13 graduado); preempção setGoal(null); flee/attack despachados   |
| SURV-03     | 08-04       | Se abriga à noite / em perigo (abrigo de emergência)             | ✓ SATISFIED | Guarda hostil+cornered+isNight → shelter (reflex.ts:68); skill shelter registrada                  |
| SURV-04     | 08-04       | Evita perigos ambientais (lava/queda/afogamento) via guardas      | ✓ SATISFIED | gatilhos lavaAhead/fallAhead/drowning via physicsTick; preempção retreatEnv lifeCritical            |
| SURV-05     | 08-04       | Reflexo tem precedência sobre deliberação sem bloquear o LLM      | ✓ SATISFIED | setGoal(null) imediato no execute; runReflex isolado de inFlight; [reflect] confirmado ao vivo (D-20) |

Nenhum requisito órfão — REQUIREMENTS.md mapeia SURV-01..05 a Phase 8, todos cobertos pelo plan 08-04.

### Anti-Patterns Found

| File     | Line | Pattern                          | Severity | Impact                                                                                     |
| -------- | ---- | -------------------------------- | -------- | ------------------------------------------------------------------------------------------ |
| loop.ts  | 102-105 | `lavaAhead: false / fallAhead: 0` (hardcoded em buildReflexSensors) | ℹ️ Info  | Intencional e documentado: ambiental já preempta no execute via physicsTick; o sensor idle só serve para eat/shelter. Não é stub — não regride o goal. |

Nenhum blocker ou warning encontrado. Os valores hardcoded em `buildReflexSensors` são by-design (a detecção ambiental real vive no `onPhysicsTick` do TriggerBus, não no snapshot idle).

### Human Verification Required

#### 1. Demonstração AO VIVO dos reflexos de sobrevivência

**Test:** Com servidor Minecraft + LM Studio rodando (`bun start`), criar situações de gatilho:
- Reduzir fome do bot a <= hungryThreshold com comida no inventário
- Atrair/spawnar um mob hostil (creeper/zombie) para perto
- Aproximar o bot de lava ou de uma queda > fallDangerBlocks blocos

**Expected:**
- `[reflex] eat success` e o food sobe
- `preemptando … (lifeCritical)` e o bot foge (ou ataca se encurralado)
- `lavaAhead`/`fallAhead` preempta e o bot recua (não anda para o perigo); a parada é imediata (setGoal(null)), sem travar esperando o LLM

**Why human:** Requer servidor + LM Studio em execução e a criação manual de situações de gatilho em jogo. Na sessão de verificação ao vivo de 2026-06-22 nenhuma dessas situações ocorreu — somente o gate primário D-20 (`[reflect] reflexão executada`) foi exercitado e confirmado. O comportamento físico está coberto por testes unitários (tabela-verdade + skills), mas a demonstração em jogo permanece como UAT pendente.

### Gaps Summary

Nenhum gap bloqueante. Todos os 6 must-haves estão verificados no código e a suite está verde (455 pass / 0 fail). A camada reflexa está completa e fiada de ponta a ponta:
- arbitrateReflex (pura, winner-take-all, ordenada por gravidade D-03) com 21 casos de teste
- 4 skills reflexas (eat/flee/shelter/attack) registradas no skillRegistry
- TriggerBus emite os 4 gatilhos lifeCritical via physicsTick edge-detection com histerese e null-safety
- Preempção generalizada no execute com setGoal(null) ANTES do abort (D-07) e cleanup de N listeners
- Driver despacha o reflexo vencedor sem nunca tocar o LLM/inFlight — o [reflect] (gate D-20) foi confirmado AO VIVO em 2026-06-22 (regressão B1 não reapareceu)

O único item pendente é não-bloqueante: a demonstração AO VIVO dos reflexos de sobrevivência (eat/flee/ambiental) atuando em jogo, registrada como UAT humano. O comportamento já está coberto por testes; a verificação física confirmaria a integração com o mundo real.

---

_Verified: 2026-06-22_
_Verifier: Claude (gsd-verifier)_
