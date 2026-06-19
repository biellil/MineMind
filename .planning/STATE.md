---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Autonomia de Verdade
status: verifying
stopped_at: Phase 7 context gathered
last_updated: "2026-06-19T22:55:01.796Z"
last_activity: "2026-06-19 - Completed quick task 260619-rv8: Morte/void do bot + poda do checkpointer (CR#1/CR#2/CR#3)"
progress:
  total_phases: 9
  completed_phases: 1
  total_plans: 3
  completed_plans: 3
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-19)

**Core value:** O agente permanece ativo de forma autônoma, percebe o mundo e age sobre ele com base em objetivos próprios e memória — sem intervenção humana. Se tudo falhar, o loop cognitivo (perceber → decidir → agir) precisa funcionar.
**Current focus:** Phase 06 — llm-provider-factory

## Current Position

Phase: 7
Plan: Not started
Status: Phase complete — ready for verification
Last activity: 2026-06-19 - Completed quick task 260619-rv8: Morte/void do bot + poda do checkpointer (CR#1/CR#2/CR#3)

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

Last session: 2026-06-19T22:55:01.785Z
Stopped at: Phase 7 context gathered
Resume file: .planning/phases/07-grounding-skillresult/07-CONTEXT.md
