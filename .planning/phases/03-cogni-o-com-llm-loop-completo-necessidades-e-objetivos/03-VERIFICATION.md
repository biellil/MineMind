---
phase: 03-cogni-o-com-llm-loop-completo-necessidades-e-objetivos
verified: 2026-06-19T00:00:00Z
status: passed
score: 5/5 success criteria verified (22/22 must-have truths across 5 plans)
re_verification: null
cross_phase_risks:
  - id: gathering-collectblock-oom
    backlog: 999.1
    origin_phase: 2
    severity: critical
    summary: "A skill dig/collectBlock/pathfinder da Fase 2 estoura memória (~12 GB observados ao vivo) sempre que o arbiter entra no estado 'gathering', derrubando o bot. NÃO é requisito da Fase 3 — nenhum de COG-03/CHAT/LLM/NEED/GOAL/CONN-03 depende de 'gathering funcionar'. Mascarou a observação AO VIVO de D-13 (pedido→objetivo executável de coleta) e D-15 (preempção por sobrevivência com resources ativo); ambos permanecem provados headless. Fere na prática o core value (loop autônomo contínuo) quando o agente entra em coleta. Recomendação: /gsd:debug dedicado à raiz do OOM."
---

# Phase 3: Cognição com LLM (Loop Completo, Necessidades e Objetivos) Verification Report

**Phase Goal:** Com o loop já provado, o LLM local (LM Studio) passa a guiar análise, planejamento, reflexão e conversa coerente, sob uma arquitetura de duas taxas (camada reativa rápida + deliberação LLM sob gatilho, single-flight). O sistema de motivação intrínseca entra: necessidades internas que decaem alimentam objetivos dinâmicos priorizados, com comprometimento/histerese.
**Verified:** 2026-06-19
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth (Success Criterion) | Status | Evidence |
| --- | --- | --- | --- |
| 1 | LLM local raciocina/planeja atrás de um provedor abstraído; saída restringida (enum fechado + Zod + repair/fallback) | ✓ VERIFIED | `provider.ts` isola `ChatOpenAI` atrás de `LlmProvider` (LLM-03); `schemas.ts:22` `z.enum(['gather','explore','navigate','idle','chat'])` (enum FECHADO, LLM-02); `structured.ts` `decideAction` faz repair de 1 tentativa + fallback determinístico (D-17). Confirmado AO VIVO (qwen3-vl-8b). |
| 2 | Loop em duas taxas com LLM single-flight (não trava a camada reativa), re-planejando sob gatilho | ✓ VERIFIED | `deliberation.ts` `inFlight` single-flight + `lastRunAt` (orçamento de replan); `loop.ts:76` `void deliberator.maybeDeliberate(...)` (não-bloqueante); `pickTrigger` event-driven por urgência. Smoke test C passa (segunda deliberação concorrente NÃO dispara). |
| 3 | Lê chat e responde de forma coerente, com personalidade base consistente | ✓ VERIFIED | `conversation.ts` `shouldRespond`/`handleConversation` → `provider.chat([SystemMessage(buildPersonaPrompt), ...])`; `prompts.ts` persona estática "sobrevivente pragmático" (CHAT-03/D-01) + espelha idioma pt-BR (D-02). Confirmado AO VIVO ("Oi. O que você precisa?"). |
| 4 | Necessidades decaem e influenciam estado/prioridade com anti-starvation; objetivos com prioridade/progresso/dependências e comprometimento (histerese/orçamento) | ✓ VERIFIED | `needs.ts` `evaluateNeeds` (survival/resources do snapshot, curiosity por timer) + `urgency` (anti-starvation); `goals.ts` `generateGoals` (priority/progress/dependsOn) + `selectGoal` (histerese via `hysteresisMargin` + preempção `survivalCritical`/`playerRequestPending`). Smoke test B passa. |
| 5 | Estado cognitivo vive fora do bot e sobrevive a uma reconexão | ✓ VERIFIED | `state.ts` `CognitiveStateHolder`; `bot/index.ts:11` `createCognitiveStateHolder()` criado 1x ANTES de `createBot` e reusado por sessão; `reconnect.test.ts` prova needs/goals/memory/disposition preservados entre 2 sessões com o MESMO holder (CONN-03/D-20). |

**Score:** 5/5 success criteria verified. (22/22 must-have truths verificados nos 5 planos.)

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/llm/provider.ts` | LlmProvider + createLmStudioProvider | ✓ VERIFIED | 85 linhas; ChatOpenAI baseURL+apiKey dummy, isolado; decide/chat/available |
| `src/llm/schemas.ts` | ActionDecision enum FECHADO + Zod | ✓ VERIFIED | 30 linhas; `z.enum([...])` de 5 ações + params |
| `src/llm/structured.ts` | decideAction repair/retry + fallback | ✓ VERIFIED | 59 linhas; available()→fallback, parse, repairHint, fallback final |
| `src/llm/prompts.ts` | persona estática + serialização | ✓ VERIFIED | 113 linhas; buildPersonaPrompt/serializeContext, persona pragmática |
| `src/memory/shortTerm.ts` | estimateTokens via js-tiktoken | ✓ VERIFIED | js-tiktoken o200k_base; assinatura preservada |
| `src/motivation/types.ts` | Need/NeedKind/Goal/GoalSource/MotivationConfig | ✓ VERIFIED | 5 NeedKinds (shelter/social como STUB documentado, D-08) |
| `src/motivation/needs.ts` | evaluateNeeds + urgency (puro) | ✓ VERIFIED | 69 linhas; híbrido snapshot/timer + anti-starvation |
| `src/motivation/goals.ts` | selectGoal/generateGoals (puro) | ✓ VERIFIED | 81 linhas; histerese + preempção + dependsOn estrutural |
| `src/cognition/state.ts` | CognitiveStateHolder + factory | ✓ VERIFIED | 64 linhas; fonte única em-processo da mente |
| `src/cognition/deliberation.ts` | maybeDeliberate single-flight | ✓ VERIFIED | 131 linhas; inFlight + event-driven + decideAction |
| `src/config.ts` | motivationConfigFor(disposition) | ✓ VERIFIED | pesos distintos AUTONOMOUS vs ASSISTANT (D-06/D-10) |
| `src/control/disposition.ts` | parseDisposition literal | ✓ VERIFIED | !ajudante/!sozinho literais (D-05) |
| `src/chat/conversation.ts` | shouldRespond + handleConversation | ✓ VERIFIED | 126 linhas; provider.chat + persona, isolado do parser de controle |
| `src/control/commands.ts` | !auto no mapa COMMANDS | ✓ VERIFIED | `'!auto': 'autonomous'` (D-14), !livre intacto |
| `src/cognition/loop.phase3.smoke.test.ts` | smoke headless Fase 3 | ✓ VERIFIED | 3 testes A/B/C verdes (fallback, needs/goals, single-flight) |
| `src/cognition/reconnect.test.ts` | prova CONN-03 | ✓ VERIFIED | 2 testes verdes; estado preservado entre sessões |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| structured.ts | provider.ts | provider.decide/available | ✓ WIRED | available() gate + decide() com repair |
| structured.ts | arbiter (fallback) | callback injetado | ✓ WIRED | fallback() chamado em indisponível/irreparável |
| needs.ts | WorldSnapshot | snapshot.status/inventory | ✓ WIRED | health/food lidos do snapshot |
| goals.ts | preempção | survivalCritical/playerRequestPending | ✓ WIRED | selectGoal respeita ambos |
| bot/index.ts | state.ts | createCognitiveStateHolder() 1x | ✓ WIRED | criado antes de createBot, reusado |
| loop.ts | holder | startCognitiveLoop(bot, holder) | ✓ WIRED | holder por parâmetro |
| deliberation.ts | structured.ts | decideAction(provider, msgs, fallback) | ✓ WIRED | dentro de maybeDeliberate single-flight |
| nodes.ts | holder.llmDecision | decide lê decisão LLM com frescor | ✓ WIRED | TTL `replanMinIntervalMs * 2`, senão arbiter |
| nodes.ts | motivationConfigFor | observe usa cfg da disposição | ✓ WIRED | evaluateNeeds/generateGoals/selectGoal por disposição |
| loop.ts | conversation.ts | parseCommand→parseDisposition→conversation | ✓ WIRED | ordem estrita; conversa via `void` não bloqueia |
| conversation.ts | provider.ts | provider.chat(messages) com persona | ✓ WIRED | SystemMessage(buildPersonaPrompt) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| nodes.ts (observe) | holder.needs/goals | evaluateNeeds(snapshot real do bot) / generateGoals | ✓ Sim — derivado do WorldSnapshot vivo + timer | ✓ FLOWING |
| nodes.ts (analyze/decide) | holder.llmDecision | maybeDeliberate→decideAction→provider.decide (ou arbiter fallback) | ✓ Sim — LLM real ou arbiter determinístico | ✓ FLOWING |
| conversation.ts | reply | provider.chat (LLM real) | ✓ Sim — confirmado ao vivo | ✓ FLOWING |
| reconnect/smoke tests | holder state | mutação + invoke do grafo real | ✓ Sim — asserções sobre estado preservado/acumulado | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| CONN-03 + degradação + single-flight (headless) | `bun test reconnect.test.ts loop.phase3.smoke.test.ts` | 5 pass / 0 fail / 42 expects | ✓ PASS |
| Suite completa sem regressão | `bun test` | 160 pass / 0 fail (19 arquivos) | ✓ PASS |
| Typecheck | `bunx tsc --noEmit` | EXIT 0 (limpo) | ✓ PASS |
| Raciocínio/conversa LLM, disposição, controle, degradação (ao vivo) | Checkpoint humano MC 1.21.4 + LM Studio | Confirmado pelo usuário (D-05/D-07/D-17/CHAT-01/02/controle) | ✓ PASS (human) |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| LLM-01 | 03-01, 03-03 | Raciocina/planeja via LLM local (LM Studio) | ✓ SATISFIED | provider.ts + decideAction; ao vivo |
| LLM-02 | 03-01, 03-03, 03-05 | Saída validada (enum fechado + Zod + repair/fallback) | ✓ SATISFIED | schemas.ts enum + structured.ts repair |
| LLM-03 | 03-01 | Cliente LLM abstraído por provedor | ✓ SATISFIED | LlmProvider; ChatOpenAI só em provider.ts |
| CHAT-01 | 03-04, 03-05 | Lê chat do servidor | ✓ SATISFIED | bot.on('chat') em loop.ts; ao vivo |
| CHAT-02 | 03-04, 03-05 | Responde coerente | ✓ SATISFIED | conversation.ts provider.chat; ao vivo |
| CHAT-03 | 03-01 | Personalidade base estática | ✓ SATISFIED | prompts.ts persona "sobrevivente pragmático" |
| NEED-01 | 03-02, 03-05 | Necessidades internas (5) que decaem/variam | ✓ SATISFIED | needs.ts; 5 NeedKinds (2 stub D-08, documentado) |
| NEED-02 | 03-02, 03-03, 03-05 | Necessidades influenciam estado/prioridade com anti-starvation | ✓ SATISFIED | urgency() anti-starvation + observe usa cfg |
| GOAL-01 | 03-02, 03-04, 03-05 | Objetivos com prioridade/progresso/dependências | ✓ SATISFIED | goals.ts priority/progress/dependsOn |
| GOAL-02 | 03-02, 03-03, 03-05 | Comprometimento/histerese + orçamento replan | ✓ SATISFIED | selectGoal hysteresisMargin + deliberation lastRunAt |
| COG-03 | 03-03, 03-05 | Duas taxas + LLM single-flight | ✓ SATISFIED | deliberation.ts inFlight; smoke test C |
| CONN-03 | 03-03, 03-05 | Estado sobrevive a reconexão | ✓ SATISFIED | holder 1x em bot/index.ts; reconnect.test.ts |

Todos os 12 IDs declarados nas frontmatters dos planos estão mapeados a Phase 3 em REQUIREMENTS.md. Nenhum ID ORFÃO (nenhum requisito mapeado à Phase 3 ficou sem plano).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| — | — | Nenhum stub acidental encontrado | — | shelter/social são STUB intencional documentado (D-08); dependsOn `[]` estrutural intencional (D-16). Ambos declarados nos must_haves. |

### Cross-Phase Risk (Warning — NÃO falha a Fase 3)

⚠️ **gathering-collectblock-oom (backlog 999.1) — dívida da Fase 2, severidade crítica.**
A skill `dig`/`collectBlock`/`pathfinder` da Fase 2 estoura memória (~12 GB ao vivo) quando o arbiter entra no estado `gathering`, derrubando o bot. Não é requisito da Fase 3 — nenhum de COG-03/CHAT/LLM/NEED/GOAL/CONN-03 depende de "gathering funcionar". Mascarou a observação AO VIVO de D-13 (pedido→objetivo executável de coleta) e D-15 (preempção por sobrevivência com resources ativo); **ambos permanecem provados headless** (Plans 02/03/04). Fere na prática o core value (loop autônomo contínuo) sempre que o agente entra em coleta. **Recomendação:** `/gsd:debug` dedicado à raiz do OOM (limitar busca, timeout duro, raio efetivo de coleta).

### Human Verification Required

Nenhum item bloqueante pendente. O checkpoint humano ao vivo (03-05) já foi executado com o usuário em servidor MC 1.21.4 real + LM Studio (qwen/qwen3-vl-8b), confirmando: raciocínio/conversa LLM (crit. 1/3), troca de disposição por chat (D-05), AUTONOMOUS ignora conversa (D-07), controle independente da disposição (!pausar/!auto), e degradação graciosa ao arbiter com recuperação (D-17). CONN-03 (crit. 5) foi provado headless. Loop duas-taxas single-flight (crit. 2) provado headless.

### Gaps Summary

Nenhuma lacuna bloqueante. Os 5 critérios de sucesso da ROADMAP estão atendidos com evidência direta no código (todos os artefatos existem, são substantivos, estão conectados e os dados fluem de verdade), corroborados por 160/160 testes verdes, typecheck limpo, e um checkpoint humano ao vivo. Os dois únicos "stubs" (shelter/social, dependsOn vazio) são intencionais e explicitamente declarados nas must_haves dos planos (D-08/D-16), com escopo futuro definido. O único risco aberto é dívida da Fase 2 (gathering-OOM), registrado acima como aviso cross-phase para permanecer visível.

---

_Verified: 2026-06-19_
_Verifier: Claude (gsd-verifier)_
