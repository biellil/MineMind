---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Autonomia de Verdade
status: executing
stopped_at: Completed 08-02-PLAN.md
last_updated: "2026-06-20T21:39:28.314Z"
last_activity: 2026-06-20
progress:
  total_phases: 10
  completed_phases: 3
  total_plans: 15
  completed_plans: 13
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-19)

**Core value:** O agente permanece ativo de forma autônoma, percebe o mundo e age sobre ele com base em objetivos próprios e memória — sem intervenção humana. Se tudo falhar, o loop cognitivo (perceber → decidir → agir) precisa funcionar.
**Current focus:** Phase 08 — system-1-sobreviv-ncia-reflexa

## Current Position

Phase: 08 (system-1-sobreviv-ncia-reflexa) — EXECUTING
Plan: 3 of 4
Status: Ready to execute
Last activity: 2026-06-20

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed (v1.0): 24
- Average duration: — min
- Total execution time: — hours

**By Phase (v2.0):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 6-14 | TBD | - | - |

**Recent Trend:**

- v1.0 shipped 2026-06-19 (5 fases + backlog 999.1)
- Trend: —

*Updated after each plan completion*
| Phase 06 P01 | 3 | 2 tasks | 2 files |
| Phase 06 P02 | 4 | 3 tasks | 7 files |
| Phase 06 P03 | 8 | 2 tasks | 2 files |
| Phase 07 P01 | 4 | 3 tasks | 4 files |
| Phase 07 P02 | 8 | 4 tasks | 7 files |
| Phase 07 P03 | 7 | 4 tasks | 13 files |
| Phase 07 P04 | 5 | 2 tasks | 3 files |
| Phase 08 P01 | 12 | 2 tasks | 4 files |
| Phase 08 P02 | 7 | 2 tasks | 7 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap v2.0]: Build order dependência-dirigida (HIGH conf. da pesquisa) — infra (provider+grounding) ANTES de gameplay; sobrevivência (System 1) ANTES de progressão; building/combate/aprendizado por último.
- [Roadmap v2.0]: System 1 = função pura no driver (fora do StateGraph); reflexão reusa `trigger:reflect` da deliberação single-flight — NÃO criar nó novo no grafo.
- [Roadmap v2.0]: Modo assistente = objetivo com condição-de-saída (NÃO máquina de modos paralela) — mata a regressão "grude no jogador".
- [Roadmap v2.0]: Bound do pathfinder do 999.1 aplicado a TODA nova chamada (flee/shelter/building/combate/tech-tree), não só collectblock — critério de aceite por feature.
- [Roadmap v2.0]: Provider cloud = GPT-4.1-mini (decisão do usuário); embeddings sempre locais; teto de custo entra JUNTO com a abstração.
- [Phase 06]: 06-01: createProvider() seleciona local/openai por LLM_PROVIDER; embed cloud delega a createLocalEmbedder (embeddings sempre locais); fallback z.toJSONSchema (D-16) blinda decide() nos dois providers
- [Phase 06]: 06-02: teto de custo = decorator withSpendCap (hard-cap de chamadas/janela diária em SQLite); estourou -> fallback-to-local (D-08); local = no-op de cap; embed sempre local
- [Phase 06]: 06-03: paridade PROV-04 por 3 camadas — schema-only (D-14, pega caveat zod v4 #8357 no CI), live gated RUN_LIVE_PARITY (D-15), e teste de fallback type:None (D-16/D-17); validate->repair->fallback preservado nos dois providers
- [Phase 07]: 07-01: módulo grounding/ é o contrato da Fase 7 — SkillResult tagueado por outcome (deriva de observed/expected, nunca da Promise); captureGroundState imutável independente do executor (D-05); evaluateDig/evaluateNavigate puros classificam por delta numérico sem mock de bot; observed não tipado por skill (D-02)
- [Phase 07]: 07-02: 4 skills retornam SkillResult — dig/navigate grounded (captureGroundState before/after + evaluateDig/Navigate, outcome do delta real não da Promise); D-08 delta lido após catch (timeout 3/10 -> observed:3); D-12 pré-condições viram no_effect e follow/attack stubs resolvem outcome:'error' sem lançar; SkillFunction retipada Promise<SkillResult>. Handoff: execute node (nodes.ts) ainda registra success em qualquer resolução — Plan 03 deve consumir r.outcome.
- [Phase 07]: 07-03: execute node deriva memória do SkillResult observado (result.outcome), não do não-throw — mata 'peguei 10 tábuas' na raiz (D-09 B/GRND-02). MemEvent.action ganha outcome/observed/expected (D-13, result vira derivado); partial/no_effect/error=failure preservando observed (GRND-04). holder.lastObservedDelta + bloco FATO VERIFICADO autoritativo no prompt (D-09 A). Insumo do post-filter da Plan 04.
- [Phase 07]: 07-04: post-filter determinístico (camada C/D-09 C/D-10) reconcilia a fala do LLM contra holder.lastObservedDelta antes do bot.chat — 'peguei 10' vira 'peguei 3' (ou 0 em no_effect). Escopo mínimo (quantidade de coleta pt-BR); A=instrução, C=gate (D-11). Fase 7 completa.
- [Phase 08]: 08-01: arbitrateReflex = função pura no driver (D-01) — winner-take-all por gravidade D-03 (ambiental>hostil>queda>vida>fome); D-17 shelter = variação do caminho hostil (cornered+noite); D-02 só fome é lifeCritical=false; limiares de sobrevivência em config com histerese enter/exit
- [Phase 08]: 08-02: eat (D-05) equipa→consume→re-equip grounded por delta LOCAL de bot.food (Pitfall 2, não toca GroundState); attack (D-15) vira 1-shot real via bot.attack sem perseguir (stub removido); eat/attack registrados no skillRegistry

### Roadmap Evolution

- Phase 07.1 inserida após a Phase 7: "Loop Agêntico — Percepção Dirigida por Consequência" (URGENT/INSERTED). Substitui o tick fixo (driver `while` externo em `src/cognition/loop.ts`) por cadeia agêntica ReAct (ação termina → re-percebe → próximo passo). Entra ANTES da Phase 8 porque o System 1 (reflexos por preempção) depende deste modelo de loop. ⚠️ Conflito com decisão prévia "System 1 = função pura no driver fora do StateGraph" — revisitar essa decisão no planejamento da 07.1.

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

- [gathering-collectblock-oom] (resolvido no escopo do dig pela 999.1; raio alto ainda pressiona memória — vigiar nas features novas via bound de pathfinder).

### Blockers/Concerns

[Issues that affect future work]

- [Known Gap v1.0 → gate da Phase 14]: Fase 4 NÃO verificada ao vivo (`[reflect]` dispara? KNN relevante? estado sobrevive a kill duro?). Resolver como gate de entrada da Phase 14 (Aprendizado), não em paralelo.
- [Phase 8]: re-testar `[reflect]` AO VIVO depois de introduzir o System 1 — a nova camada muda quando o lock do LLM fica livre (regressão B1 pode reaparecer).
- [Research flags]: Phases 10 (Tech-tree DAG), 13 (Combate) e 14 (Aprendizado) sinalizadas para /gsd:research-phase no planejamento.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260619-qwx | Enriquecer percepção: lookingAt (bloco na mira), underfoot (bloco sob os pés) e render de entities/mobs no prompt | 2026-06-19 | f1b32d0 | [260619-qwx-enriquecer-percepcao-lookingat-bloco-na-](./quick/260619-qwx-enriquecer-percepcao-lookingat-bloco-na-/) |
| 260619-rv8 | Tratar morte/void do bot (snapshot null + parada graciosa por deadTicks) e vazamento de RAM (poda periódica do MemorySaver via deleteThread) | 2026-06-19 | eb1df53 | [260619-rv8-tratar-morte-void-do-bot-e-vazamento-de-](./quick/260619-rv8-tratar-morte-void-do-bot-e-vazamento-de-/) |

## Session Continuity

Last session: 2026-06-20T21:39:28.309Z
Stopped at: Completed 08-02-PLAN.md
Resume file: None
