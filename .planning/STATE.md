---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Autonomia de Verdade
status: executing
stopped_at: Completed 12-01-PLAN.md
last_updated: "2026-06-22T20:53:51.343Z"
last_activity: 2026-06-22
progress:
  total_phases: 13
  completed_phases: 9
  total_plans: 35
  completed_plans: 33
  percent: 95
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-19)

**Core value:** O agente permanece ativo de forma autônoma, percebe o mundo e age sobre ele com base em objetivos próprios e memória — sem intervenção humana. Se tudo falhar, o loop cognitivo (perceber → decidir → agir) precisa funcionar.
**Current focus:** Phase 12 — building-deliberado

## Current Position

Phase: 12 (building-deliberado) — EXECUTING
Plan: 2 of 3
Status: Ready to execute
Last activity: 2026-06-22

Progress: [█████████░] 95%

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
| Phase 08 P03 | 6 | 2 tasks | 6 files |
| Phase 08.1 P01 | 4 | 2 tasks | 3 files |
| Phase 08.1 P02 | 4 | 2 tasks | 4 files |
| Phase 08.1 P03 | 9 | 3 tasks | 4 files |
| Phase 08.1 P04 | 11 | 3 tasks | 7 files |
| Phase 08.1 P05 | 7 | 2 tasks | 5 files |
| Phase 08.1 P06 | 18 | 3 tasks | 10 files |
| Phase 08.1 P07 | 2 | 2 tasks | 3 files |
| Phase 09 P01 | 6 | 2 tasks | 6 files |
| Phase 09 P04 | 4 | 2 tasks | 4 files |
| Phase 09 P02 | 5 | 1 tasks | 2 files |
| Phase 09 P03 | 13 | 3 tasks | 9 files |
| Phase 09 P05 | 5 | 3 tasks | 4 files |
| Phase 10.1 P01 | 26 | 3 tasks | 6 files |
| Phase 10.1 P02 | 18 | 2 tasks | 8 files |
| Phase 11.1 P01 | 18 | 2 tasks | 2 files |
| Phase 12 P01 | 7 | 3 tasks | 6 files |

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
- [Phase 08]: 08-03: flee (D-06) GoalInvert(GoalFollow)+setGoal(goal,true) com fallback sprint cego; abort forçado setGoal(null) D-07; grounded por delta de distância; shelter (D-08) cavar-vs-pilar com guarda anti-lava + placeBlock mínimo; flee/shelter no skillRegistry
- [Phase 08.1]: 08.1-01: schema migra user_version 1→2 por degraus idempotente (cold start 0→2 e DB v1→2 no mesmo caminho); places.type (D-14), tabela lessons (D-19), idx_places_xz (D-16); vec_events fica inerte (aposentado no Plan 04); PlaceType/LessonRow exportados p/ Plans 05/06
- [Phase 08.1]: 08.1-02: recordEvent (push CP + persistEvent LP, embedding null) plugado nos 4 pontos de origem (nodes.ts x3, loop.ts x1) — mata events=0 ao vivo; try/catch interno preserva o tick (Core Value); embedding null mantém o LLM fora do caminho quente (D-07)
- [Phase 08.1]: 08.1-03: ChromaDB isolado atrás de ChromaMemoryClient (health/addVector/queryVectors/isAvailable); circuit breaker hand-rolled + withTimeout via Promise.race garantem que o loop nunca aborta nem pendura por causa do Chroma (D-02); get-or-create cosine dim 768 bring-your-own (D-03/D-05/D-23); aviso OFFLINE debounced (D-22); now injetável torna o breaker testável sem servidor
- [Phase 08.1]: 08.1-04: consolidate grava o vetor no ChromaDB (String(id), D-07); retrieve consulta o Chroma (KNN) preservando o scoring Generative Agents; chroma é param OPCIONAL (default null → fallback de recência D-02); vec0 aposentado em consolidate E persistEvent (sem tabela órfã); health-check boot + chromaProbeTimer periódico religam o caminho vetorial (D-22)
- [Phase 08.1]: 08.1-05: caminho de AÇÃO recupera memórias (top-k=3) por query=embedding(currentGoal) cacheado por hash do goal (D-11, ~1 embed por troca de goal); seção 'Memórias relevantes:' injetada antes do FATO VERIFICADO (D-12); log [recall] por memória torna o uso da memória verificável ao vivo (D-13) — correção central da fase
- [Phase 08.1]: 08.1-06: memória espacial (POIs) com dedup por bucket espacial (GRID=12, ON CONFLICT) + busca bounding-box/euclidiana injetada como 'POIs próximos:' no prompt (D-14/D-15/D-16); morte grava MemEvent type:'death' imp=10 + danger POI com causa inferida localmente (D-17/D-18/D-21); helpers de lições (reforço/decay aritmético clampado) como gancho durável da Phase 14 dentro da FRONTEIRA (D-19/D-20)
- [Phase 08.1]: 08.1-07 (GAP-01): POIs de proximidade fiados no nó execute — recordResourcePoi (coleta success → POI resource, só fato verificado D-09 B) e recordVillagePoi (aldeão no snapshot → POI village, exclui zombie_villager); reusam upsertPlace (dedup por bucket) e entram no prompt via nearbyPlacesString já fiado (deliberation.ts intacto). landmark/base e lições FORA do escopo.
- [Phase 09]: 09-01: placeBlockSafe deriva outcome de bot.blockAt (não da Promise) e engole o timeout do blockUpdate como falso-negativo (D-01/Pitfall 1); getRefAndFace puro prefere face de baixo; evaluateCraft/Smelt por delta do alvo, evaluateEquip LOCAL (D-18/19/20); PlaceType += 'station' (D-14); 4 timeouts de config; placeRetries reservado sem corpo (D-04)
- [Phase 09]: 09-04: equip vira verbo de 1ª classe grounded por estado LOCAL (heldItem/inventory.slots, não delta — D-19/Pitfall 2); selectToolFor binário por categoria via regex de sufixo SEM ranking por tier (D-17, Fase 10 troca o seletor mantendo o call-site); pré-flight best-effort de pickaxe/arma fiado em dig/attack (B2/D-16) sem alterar o grounding
- [Phase 09]: 09-02 (D-05/BUILD-01): shelter consome o wrapper único placeBlockSafe/getRefAndFace em vez de bot.placeBlock cru (cavar-e-tampar via getRefAndFace no topo; pilar 1×1 via belowRef+face para cima). Herda o swallow do timeout de blockUpdate e a verificação por blockAt; captura o reason engolido pelo wrapper para manter o diagnóstico de falha. Guarda anti-lava, mecânica do pilar e grounding por cobertura real preservados; 6 testes do shelter verdes
- [Phase 09]: 09-03 (CRAFT-01..03/BUILD-01): ensureStation (findBlock→navigate→placeBlock fallback + POI station best-effort, re-validado por findBlock — D-12/D-13); craft resolve receita 2x2→bancada com gate de mesa (no_effect SEM deixar bot.craft lançar — Pitfall 4/D-15); smelt funde 1 item/chamada com close() no finally (Pitfall 3) grounded por delta (D-20); 4 skills (placeBlock/craft/smelt/equip) registradas em skillRegistry/toolRegistry; bot.mineMindDb expõe o handle do DB p/ o POI; seam de injeção __deps em vez de mock.module (vaza global no bun)
- [Phase 09]: 09-05 (G-01): enum de ação estendido com craft/smelt/equip/place (FECHADO); branch state==='building' resolve o verbo de fresh.decision.action e monta params físicos do target; grounding/memória reusados — G-01 fechado no nível comportamental sem lógica de tech-tree (Phase 10 intacta)
- [Phase 10.1]: 10.1-01: Semaphore zero-dep (acquire por prioridade via findIndex + FIFO no desempate; release passa permit direto) + createTaskGate (3 flags independentes) — fundação que substitui o inFlight único; loop ainda intacto (fiação é o Plan 02)
- [Phase 10.1]: 10.1-01: LlmProvider ganha readonly maxConcurrency (local=4/cloud=3) + opts?.signal propagado a RunnableConfig.signal nos 3 providers e no withSpendCap (LangChain compõe com o timeout interno, sem AbortSignal.any manual)
- [Phase 10.1]: 10.1-01: TOCTOU do withSpendCap fechado com reserveCall (INSERT...ON CONFLICT RETURNING, increment-then-check atômico) + releaseCall (MAX(0,calls-1)); decide/chat reservam antes de disparar e estornam no fallback-to-local E no erro real; incrementCall vira métrica legada (D-10)
- [Phase 10.1]: 10.1-02: inFlight único substituído por gate-por-tipo + semáforo(provider.maxConcurrency) no loop; pickDispatch vira hint NÃO-XOR { reflect, action } — ação e reflexão coexistem (Pitfall 6), coordenadas pelo gate por tipo + semáforo
- [Phase 10.1]: 10.1-02: handleConversation roteado por routePlayerTurn (gate player, prioridade 0, preempta a AÇÃO via actionAbort.abort(), release/leave no finally) — fecha a brecha do chat-sem-coordenação (D-08)
- [Phase 10.1]: 10.1-02: holder.goals protegido do clobber por commit síncrono merge-by-id na runReflection (re-lê holder.goals no write; goal de player empurrado durante o await sobrevive — D-04/D-05/D-06/Pitfall 2); reflexão nunca recebe signal (D-13)
- [Phase 11.1]: 11.1-01: serializeContext expõe percepção espacial híbrida próx(x,y,z) Nm Δy±k para blocos/entidades/jogadores; Δy cru sem veredito (D-02); teto global BLOCK_COORD_BUDGET=18 vira único gate priorizado (troncos>pedra>minério>lixo, count de todos os tipos preservado, .slice(0,8) removido — D-03); jogador position null degrada para sem-pos sem lançar (D-04a); assinatura/call-sites/types/snapshot intactos
- [Phase 12]: 12-01: núcleo determinístico de building — geradores puros (genShelter casca-oca 6 lados/genWall/genTower) + runBlueprint idempotente (orderForReach bot-cell-last/baixo→cima/fora→dentro D-05; placeOneWithRetry liga placeRetries 0→2 D-02; grounding por cobertura real D-03/D-10); skill build resolve shelter/wall/tower/station/custom; isFilled exportado; shelter.ts/nodes.ts intactos

### Roadmap Evolution

- Phase 08.1 inserida após a Phase 8: "Refatorar memória" (URGENT/INSERTED). Diagnóstico ao vivo do `minemind.sqlite`: events=0, vec_events=0, players=0, places=0, kv=1 — persistência praticamente morta (só holder salva). Bug confirmado: `persistEvent` (src/memory/longTerm.ts) nunca é chamado em produção (só em testes); reflexão/`consolidate` também não produz nada ao vivo (Known Gap da Fase 4). Escopo: (1) consertar fiação de gravação; (2) migrar vector store de sqlite-vec → **ChromaDB** (decisão do dev; já roda local no PC dele — embeddings seguem locais via LM Studio); (3) garantir que o LLM consome memórias recuperadas (KNN no prompt, verificável ao vivo); (4) memória espacial via `places` com tipos de POI (base/build, resource, danger, village, landmark) + busca por proximidade x,y,z; (5) registrar evento de morte (local+causa, alta importância) p/ base do aprendizado da Phase 14; (6) categoria de conhecimento/lições aprendidas evolutiva (texto + confiança/contador que reforça/decai com o tempo) — conhecimento generalizado durável que o LLM consulta, distinto de events pontuais (semente da Phase 14). ⚠️ Reverte decisão HIGH-conf do STACK (sqlite-vec, single-file, zero serviço) — Chroma é serviço externo, mas o dev já o opera.
- Phase 11.1 inserida após a Phase 11: "LLM recebe posições e distâncias de blocos, mobs e entidades (percepção espacial no contexto user/human)" (URGENT/INSERTED). Hoje `serializeContext` (src/llm/prompts.ts) manda só `nome×contagem` dos blocos (descarta `examples`/coordenadas do snapshot) e só distância (sem posição) para mobs/entidades/jogadores — o LLM decide sem noção espacial (perto/longe, alcançável/inalcançável). A info enriquecida entra como mensagem **user/human** (contexto), NÃO como assistant. Origem: investigação do "bot parado" — o LLM não sabe distância/altura dos recursos e manda coletar alvos inalcançáveis.
- Phase 10.1 inserida após a Phase 10: "Paralelismo no processamento do LLM (deliberação concorrente)" (URGENT/INSERTED). Substitui a deliberação single-flight (serial) por execução concorrente de tarefas cognitivas distintas (ação, reflexão, resposta a jogador) que hoje disputam o mesmo lock `inFlight`. Motivação: o lock já gerou bug real — quick `260621-ir4` corrigiu *starvation da reflexão* (ação roubava o lock todo tick; `[reflect]` nunca rodava ao vivo) só com priorização via `pickDispatch`, remendo e não raiz. Posicionada APÓS a Phase 10 (tech-tree gera demanda cognitiva real) e ANTES da Phase 11 porque é a infra que destrava a concorrência autônomo+assistente (raciocinar o próprio objetivo enquanto responde a um pedido de jogador); a Phase 14 também precisa refletir enquanto age. ⚠️ Caveat técnico (decisão do momento): com modelo LOCAL (LM Studio, 1 GPU) a inferência serializa de qualquer jeito — o ganho é de responsividade/concorrência de tarefas, não de throughput bruto; throughput real só com provider CLOUD (GPT-4.1-mini, infra da Phase 6). Escopo/bounds definitivos no /gsd:plan-phase 10.1.
- Phase 07.1 inserida após a Phase 7: "Loop Agêntico — Percepção Dirigida por Consequência" (URGENT/INSERTED). Substitui o tick fixo (driver `while` externo em `src/cognition/loop.ts`) por cadeia agêntica ReAct (ação termina → re-percebe → próximo passo). Entra ANTES da Phase 8 porque o System 1 (reflexos por preempção) depende deste modelo de loop. ⚠️ Conflito com decisão prévia "System 1 = função pura no driver fora do StateGraph" — revisitar essa decisão no planejamento da 07.1.

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

- [gathering-collectblock-oom] (resolvido no escopo do dig pela 999.1; raio alto ainda pressiona memória — vigiar nas features novas via bound de pathfinder).

### Blockers/Concerns

[Issues that affect future work]

- [Known Gap v1.0 → gate da Phase 14]: Fase 4 NÃO verificada ao vivo (`[reflect]` dispara? KNN relevante? estado sobrevive a kill duro?). Resolver como gate de entrada da Phase 14 (Aprendizado), não em paralelo.
- [Phase 8]: re-testar `[reflect]` AO VIVO depois de introduzir o System 1 — a nova camada muda quando o lock do LLM fica livre (regressão B1 pode reaparecer). PARCIALMENTE ENDEREÇADO por quick 260621-ir4: a starvation estrutural (ação roubava o lock single-flight todo tick) foi corrigida via pickDispatch — falta validar AO VIVO que `[reflect]` agora dispara.
- [Research flags]: Phases 10 (Tech-tree DAG), 13 (Combate) e 14 (Aprendizado) sinalizadas para /gsd:research-phase no planejamento.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260619-qwx | Enriquecer percepção: lookingAt (bloco na mira), underfoot (bloco sob os pés) e render de entities/mobs no prompt | 2026-06-19 | f1b32d0 | [260619-qwx-enriquecer-percepcao-lookingat-bloco-na-](./quick/260619-qwx-enriquecer-percepcao-lookingat-bloco-na-/) |
| 260619-rv8 | Tratar morte/void do bot (snapshot null + parada graciosa por deadTicks) e vazamento de RAM (poda periódica do MemorySaver via deleteThread) | 2026-06-19 | eb1df53 | [260619-rv8-tratar-morte-void-do-bot-e-vazamento-de-](./quick/260619-rv8-tratar-morte-void-do-bot-e-vazamento-de-/) |
| 260621-ir4 | Consertar starvation da reflexão no loop — pickDispatch puro dá prioridade ao reflect; ação não rouba mais o lock single-flight todo tick (reflexão nunca rodava ao vivo) | 2026-06-21 | 87ccfc2 | [260621-ir4-consertar-starvation-da-reflexao-no-loop](./quick/260621-ir4-consertar-starvation-da-reflexao-no-loop/) |
| 260621-jhi | Parse lenient do priority na reflexão (schema sem .min/.max) + clamp [0,1] na aplicação — destrava embedding/addVector no Chroma que o modelo local quebrava ao emitir priority 10/12/8 | 2026-06-21 | 9ca318d | [260621-jhi-consertar-parse-lenient-do-priority-na-r](./quick/260621-jhi-consertar-parse-lenient-do-priority-na-r/) |
| 260621-lj3 | Aposentar de vez a vec_events e a dependência sqlite-vec — openDb deixa de carregar o sqlite-vec e de criar a virtual table vec0; dependência removida de package.json/bun.lock (SQLite vira só relacional; memória vetorial 100% no ChromaDB); órfã antiga deixada inerte | 2026-06-21 | 541cd16 | [260621-lj3-aposentar-de-vez-a-vec-events-e-a-depend](./quick/260621-lj3-aposentar-de-vez-a-vec-events-e-a-depend/) |
| 260622-nif | No modo autonomous a IA responde ao jogador sem abortar a tarefa em voo (resposta em paralelo); aplicado também ao ASSISTANT — reverte D-07 (shouldRespond responde nos 2 modos) e D-12 (routePlayerTurn não preempta mais a ação) | 2026-06-22 | 356372d | [260622-nif-no-modo-autonomous-a-ia-responde-ao-joga](./quick/260622-nif-no-modo-autonomous-a-ia-responde-ao-joga/) |

## Session Continuity

Last session: 2026-06-22T20:53:51.336Z
Stopped at: Completed 12-01-PLAN.md
Resume file: None
