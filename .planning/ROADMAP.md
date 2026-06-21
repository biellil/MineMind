# Roadmap: MineMind

## Milestones

- ✅ **v1.0 MVP** - Phases 1-5 + backlog 999.1 (shipped 2026-06-19)
- 🚧 **v2.0 Autonomia de Verdade** - Phases 6-14 (in progress)

## Overview

O v1.0 entregou a espinha cognitiva (perceber → decidir → agir), o loop com LLM local, memória/reflexão/persistência e navegação/coleta. O v2.0 transforma o MineMind de "loop que fala e vaga" em "player que sobrevive e progride sozinho". A jornada é **dependência-dirigida** (build order com confiança HIGH da pesquisa): primeiro a infra que destrava tudo (provider configurável + grounding de ações), depois a camada reflexa de sobrevivência (System 1) que mantém o bot vivo tempo suficiente para a progressão rodar, depois a cadeia de crafting/tech-tree, os modos autônomo/assistente, e por último building/combate/aprendizado — que dependem das fundações já provadas. Nada aqui é componente de topo novo: o v2.0 estende costuras que já existem no código (arbiter → System 1, `dependsOn` → DAG, `playerRequestPending` → assistente, `progressChecker` do dig → grounding, factory do provider → cloud).

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Continuação numérica do v1.0 (que terminou na Phase 5; 999.1 foi backlog/parking-lot). v2.0 começa na Phase 6.

<details>
<summary>✅ v1.0 MVP (Phases 1-5 + 999.1) - SHIPPED 2026-06-19</summary>

- [x] **Phase 1: Conexão & Navegação** - Conectar ao servidor Java, permanecer online, mover-se
- [x] **Phase 2: Loop Cognitivo (sem LLM)** - Espinha perceber→decidir→agir + memória curta + arbiter
- [x] **Phase 3: LLM + Chat** - Raciocínio/conversa via LM Studio, deliberação single-flight
- [x] **Phase 4: Memória Longa, Reflexão & Identidade** - SQLite+sqlite-vec, perfis, personalidade, reflexão (live-verify PENDENTE — Known Gap)
- [x] **Phase 5: Release MVP** - Empacotamento e tag v1.0
- [x] **Phase 999.1: Backlog OOM pathfinder** - Bounds do A* do collectblock (searchRadius/thinkTimeout/getPathTo pré-check)

</details>

### 🚧 v2.0 Autonomia de Verdade (In Progress)

**Milestone Goal:** O bot joga Minecraft como um player real — sobrevive (não morre), coleta, crafta e progride na tech tree (madeira → ferro → diamante) por conta própria, sem ficar grudado em ninguém; provider LLM configurável (GPT/local).

- [ ] **Phase 6: LLM Provider Factory** - GPT-4.1-mini + LM Studio atrás da mesma interface, com teto de custo e paridade de structured-output
- [ ] **Phase 7: Grounding + SkillResult** - Relato = mundo real verificado; mata o bug "peguei 10 tábuas"
- [ ] **Phase 8: System 1 — Sobrevivência Reflexa** - Comer/fugir/abrigar/evitar perigo em sub-segundo, por preempção sem travar o LLM
- [ ] **Phase 9: Placement + Crafting/Smelting Grounded** - placeBlock robusto + craft/smelt/equip verificados (bancada/fornalha)
- [ ] **Phase 10: Tech Tree DAG + Needs** - Progressão recursiva madeira→pedra→ferro priorizada por necessidade interna
- [ ] **Phase 11: Modos Autônomo/Assistente** - Self-prompting default + assistente temporário que volta sozinho (mata o "grude")
- [ ] **Phase 12: Building Deliberado** - Estado building real: abrigo funcional + estruturas simples
- [ ] **Phase 13: Combate Completo** - Estado fighting real: atacar/recuar com arma+armadura, sem kiting suicida
- [ ] **Phase 14: Aprendizado por Reflexão (loop fechado)** - Mortes/falhas grounded ajustam objetivos futuros; live-verify da Fase 4 como gate

## Phase Details

### Phase 6: LLM Provider Factory
**Goal**: O agente pode trocar entre GPT-4.1-mini (cloud) e LM Studio (local) por env/config sem tocar o loop cognitivo, com proteção de custo e paridade de saída estruturada verificada nos dois caminhos.
**Depends on**: Phase 5 (v1.0 — usa a interface `LlmProvider`/factory existente)
**Requirements**: PROV-01, PROV-02, PROV-03, PROV-04, PROV-05
**Success Criteria** (what must be TRUE):
  1. Definir `LLM_PROVIDER=openai` faz o loop raciocinar com GPT-4.1-mini; `=local` (default) usa LM Studio — sem nenhuma alteração no código do loop
  2. O structured output (Zod) produz saída válida e parseável nos DOIS providers (paridade verificada por teste rodando contra cada perfil); fallback `zodToJsonSchema`→JSON Schema cru cobre o caveat zod v4 ↔ `withStructuredOutput`
  3. Os embeddings permanecem locais (LM Studio) independentemente do provider de chat ativo — o KNN semântico continua custo-zero mesmo com chat na cloud
  4. As chamadas cloud respeitam um teto de gasto/frequência configurável (hard-cap de chamadas/janela persistido + gate de invocação + `max_tokens` baixo + prompt caching; `reasoning.effort` aplicado SÓ condicionalmente se o modelo for gpt-5.x/o-series — D-03/D-04) — a fatura não escala com o bot parado
**Plans**: 3 plans
Plans:
- [x] 06-01-PLAN.md — Factory + cloud provider (GPT-4.1-mini) + embeddings locais por composição + fallback zod v4 (PROV-01/02/03/04)
- [x] 06-02-PLAN.md — Teto de custo (withSpendCap hard-cap → fallback-to-local, contador SQLite) + fiação createProvider (PROV-05)
- [x] 06-03-PLAN.md — Paridade de structured output: teste schema-only + fallback D-16 + live gated RUN_LIVE_PARITY (PROV-04)

### Phase 7: Grounding + SkillResult
**Goal**: Toda skill retorna um resultado verificado por delta real de inventário/mundo, e o agente só relata (chat/memória) o que o estado confirma — eliminando a alucinação "peguei 10 tábuas" que corromperia a tech-tree e o aprendizado.
**Depends on**: Phase 6
**Requirements**: GRND-01, GRND-02, GRND-03, GRND-04
**Success Criteria** (what must be TRUE):
  1. Cada skill retorna um `SkillResult` cujo `ok` deriva de `observed` (delta de inventário/posição/bloco antes-depois), nunca da resolução da Promise
  2. As skills existentes navigate/dig/follow/attack são convertidas para retornar `SkillResult` grounded (generaliza o `progressChecker` do dig)
  3. Ao vivo, o que o bot diz no chat e grava na memória bate com o inventário real do jogo em centenas de ações (o "peguei 10 tábuas" não ocorre mais)
  4. Uma ação cujo `observed` não satisfaz o `expected` é registrada na memória como falha (não como sucesso)
**Plans**: 4 plans
Plans:
- [x] 07-01-PLAN.md — Modulo grounding/: SkillResult + GroundState + captureGroundState + evaluate puro (GRND-01)
- [x] 07-02-PLAN.md — Converter navigate/dig/follow/attack para retornar SkillResult grounded; delta capturado mesmo em throw (GRND-03)
- [x] 07-03-PLAN.md — Execute node deriva memoria do delta (mata o bug); MemEvent estendido (D-13); prompt autoritativo (GRND-02/GRND-04)
- [x] 07-04-PLAN.md — Post-filter deterministico reescreve quantidade da fala para o grounded antes do bot.chat (GRND-02)

### Phase 07.1: Loop Agentico - Percepcao Dirigida por Consequencia (INSERTED)

**Goal:** Substituir o driver de tick fixo (while + sleep) por cadeia agêntica event-driven: a ação termina → re-percebe → decide o próximo passo. O agente percebe e age por consequência (actionFinished), nunca por relógio.
**Requirements**: TBD
**Depends on:** Phase 7
**Plans:** 3/4 plans executed

Plans:
- [x] 07.1-01-PLAN.md — EntityInfo.kind + TriggerBus com edge-detectors (nightFell, hostileNearby, hungry, stuck) + config novos limiares
- [x] 07.1-02-PLAN.md — nextMechanicalStep arbiter-as-classifier (null = escalar ao LLM) + roteador por outcome em pickTrigger
- [x] 07.1-03-PLAN.md — Driver event-driven: makeParkPromise substitui sleep; enteredIdle/nextWakeMs no grafo; timers autônomos de heartbeat
- [ ] 07.1-04-PLAN.md — AbortController/AbortSignal: ExecuteOptions + navigate/dig honram abort + nó execute orquestra preempção via hostileNearby

### Phase 8: System 1 — Sobrevivência Reflexa
**Goal**: O agente sobrevive aos assassinos rápidos (fome, mob hostil, perigos ambientais) reagindo em sub-segundo por uma camada reflexa pura sem LLM, que tem precedência de execução física sobre a ação deliberada por preempção — sem bloquear a inferência single-flight.
**Depends on**: Phase 7 (reflexos usam skills grounded)
**Requirements**: SURV-01, SURV-02, SURV-03, SURV-04, SURV-05
**Success Criteria** (what must be TRUE):
  1. O agente come automaticamente antes de a fome causar dano e detecta mob hostil próximo reagindo (foge ou defende) em sub-segundo, sem esperar o tick do LLM
  2. O agente se abriga à noite / em perigo (abrigo de emergência) e não morre de mobs noturnos triviais nem de perigos ambientais (lava, queda, afogamento) via guardas reflexos
  3. O reflexo crítico preempta (cancela `pathfinder.stop()`/aborta a ação física em curso) a ação deliberada SEM passar pelo lock do LLM — o System 1 nunca chama o LLM, então não compete pelo `inFlight`; só vida-crítica preempta (histerese, não fila)
  4. Após introduzir o System 1, um re-teste limpo AO VIVO confirma que o `[reflect]` ainda dispara (regressão B1 não reaparece com a mudança de quando o lock do LLM fica livre)
  5. Toda nova chamada de pathfinder do reflexo (flee/shelter) herda os bounds do 999.1 (searchRadius/thinkTimeout/pré-check getPathTo) — sem reaparecer OOM por caminho novo
**Plans**: 4 plans
Plans:
- [x] 08-01-PLAN.md — Fundação: limiares de sobrevivência (config) + arbitrateReflex pura (tabela-verdade)
- [x] 08-02-PLAN.md — Skills reflexas eat (D-05) + attack 1-shot real (D-15)
- [x] 08-03-PLAN.md — Skills reflexas flee (GoalInvert+sprint, D-06) + shelter cavar-vs-pilar (D-08)
- [ ] 08-04-PLAN.md — Integração: gatilhos lifeCritical + preempção generalizada (setGoal null) + System 1 no driver + gate D-20 AO VIVO
**UI hint**: no

### Phase 08.1: Refatorar memória: migrar vetores para ChromaDB (já rodando local), consertar gravação de eventos/lugares, garantir uso real pelo LLM, memória espacial (POIs) e registro de morte (INSERTED)

**Goal:** A memória do bot funciona de verdade — eventos, lugares e perfis são gravados e o LLM realmente os usa para decidir e lembrar entre reinícios. Hoje a persistência está praticamente morta: só o holder (kv) é salvo; `events`/`vec_events`/`players`/`places` estão vazios.
**Why:** Diagnóstico ao vivo (inspeção do `minemind.sqlite`): `events=0, vec_events=0, players=0, places=0, kv=1`. O bot não acumula histórico, não cria perfis, não lembra lugares — "começa do zero" toda vez. Isso bloqueia a tech-tree (Phase 10) e o aprendizado (Phase 14), que dependem de memória real.
**How (escopo):**
  - **Bug de fiação:** `persistEvent` (src/memory/longTerm.ts) NUNCA é chamado em produção (só em testes) — ligar no loop para gravar eventos individuais (mundo/ação/chat). Confirmar/consertar a reflexão (`consolidate`/`shouldReflect`) que também não produz nada ao vivo (Known Gap da Fase 4).
  - **Vector store → ChromaDB:** migrar a camada vetorial de sqlite-vec para ChromaDB (já rodando localmente no PC do dev) — mais fácil de inspecionar e validar que o LLM usa. Embeddings continuam locais (LM Studio). Decidir se relacional fica em SQLite e só os vetores vão pro Chroma, ou tudo no Chroma.
  - **Garantir uso pelo LLM:** o contexto enviado ao LLM (serializeContext) passa a incluir memórias recuperadas (KNN) — verificável ao vivo (a recuperação retorna algo e entra no prompt).
  - **Memória espacial (POIs):** popular/usar `places` com tipos — `base`/`build`, `resource`, `danger`, `village`/`villager`, `landmark` — com busca por proximidade (x,y,z), não só por embedding. O LLM passa a saber "o que tem onde" além do raio de percepção (complementa a Phase 11.1).
  - **Registro de morte:** quando o bot morre, gravar o evento de morte (local + causa) como memória de alta importância — base para o aprendizado da Phase 14 ("morri aqui sem abrigo → evitar / priorizar abrigo").
  - **Conhecimento/lições aprendidas (evolutivo):** um lugar dedicado para o bot acumular o que aprendeu a fazer/saber (ex: "tronco no alto de árvore costuma ser inalcançável", "à noite zumbis aparecem perto da água") — entradas com texto + confiança/contador que EVOLUEM com o tempo (reforço quando confirma, decai/corrige quando falha). Distinto de `events` (fato pontual): isto é conhecimento generalizado e durável que o LLM consulta para decidir melhor. Semente do loop de aprendizado da Phase 14.
**Requirements**: TBD
**Depends on:** Phase 8
**Plans:** 7/7 plans complete

Plans:
- [x] 08.1-01-PLAN.md — Migration user_version 1→2 (places.type, tabela lessons, idx_places_xz) (D-14/D-19/D-21)
- [x] 08.1-02-PLAN.md — recordEvent: conserta o bug de fiação (push CP + persistEvent LP embedding null) nos 4 pontos de origem (D-06/D-08)
- [x] 08.1-03-PLAN.md — chromaClient.ts: ChromaDB@3.4.3 + circuit breaker + health-check + get-or-create cosine (D-01..D-05/D-22/D-23)
- [x] 08.1-04-PLAN.md — Fiação do Chroma: consolidate grava vetor + retrieve consulta KNN + health-check no boot (D-07/D-09)
- [x] 08.1-05-PLAN.md — Uso pelo LLM: recall injetado no caminho de AÇÃO (query=embedding(goal) cacheado) + seção Memórias relevantes + log [recall] (D-10..D-13)
- [x] 08.1-06-PLAN.md — POIs (upsert por bucket + busca proximidade) + morte (evento+danger POI) + lições (reforço/decay/consulta) (D-14..D-21)
- [x] 08.1-07-PLAN.md — Gap-closure GAP-01: fia POIs resource (coleta success) + village (aldeão no snapshot) via poi-detect.ts reusando upsertPlace

### Phase 9: Placement + Crafting/Smelting Grounded
**Goal**: O agente posiciona blocos de forma confiável e crafta/funde/equipa itens com verificação grounded — o primitivo `placeBlock` robusto é implementado uma vez (compartilhado por abrigo, building e estações) e a cadeia tábuas→bancada→ferramenta→fornalha→ferro produz resultados verídicos confirmados pelo inventário.
**Depends on**: Phase 7 (grounding), Phase 8 (abrigo de emergência já usa um placeBlock — aqui ele vira o wrapper robusto definitivo)
**Requirements**: BUILD-01, CRAFT-01, CRAFT-02, CRAFT-03, CRAFT-04
**Success Criteria** (what must be TRUE):
  1. O agente coloca blocos de forma confiável: wrapper com timeout + verificação `blockAt` (trata `Event blockUpdate did not fire`), item equipado na mão, face exposta correta, limpeza de listeners (não soterra a si mesmo, não acumula listeners)
  2. O agente crafta itens verificando o inventário antes/depois (grounded) e posiciona+usa a bancada de trabalho quando a receita exige 3x3 (bancada é Block real no mundo, ao alcance)
  3. O agente funde minérios na fornalha (ciclo completo putFuel→putInput→takeOutput assíncrono sem travar) e recupera o resultado
  4. O agente equipa a ferramenta/armadura apropriada do inventário antes de usá-la
**Plans**: TBD

### Phase 10: Tech Tree DAG + Needs
**Goal**: O agente resolve recursivamente os pré-requisitos de um item-alvo (DAG data-driven via minecraft-data, com memo + limite de profundidade), preenche `Goal.dependsOn`, e progride madeira→pedra→ferro de forma autônoma — com as necessidades internas reordenando dinamicamente a prioridade dos objetivos em runtime (a fusão GITM-estrutura + MineMind-motivação).
**Depends on**: Phase 9 (crafting/smelting/placement grounded são pré-requisito da progressão)
**Requirements**: TECH-01, TECH-02, TECH-03, TECH-04, TECH-05
**Success Criteria** (what must be TRUE):
  1. O agente resolve os pré-requisitos de um item-alvo recursivamente (DAG via minecraft-data); receitas 3x3 consultam `recipesFor` com a estação e não retornam "impossível" falso; sem recursão infinita (memo + cap de profundidade)
  2. O agente progride a cadeia madeira → pedra → ferro de forma autônoma (diamante como esticar), com estações posicionadas no mundo
  3. Os objetivos têm `dependsOn` preenchido e são selecionados respeitando-os (escolhe o ancestral executável, não o folha bloqueado); as necessidades internas (needs) reordenam dinamicamente a prioridade em runtime
  4. O agente minera com a ferramenta correta para o tier (pré-flight de ferramenta antes de minerar — sem cavar "a seco" e dropar nada)
  5. Toda nova chamada de pathfinder da busca de recurso/estação herda os bounds do 999.1; raio de busca separado de `PERCEPTION_RADIUS`; soak sem OOM ao buscar minério/fornalha
**Plans**: TBD

### Phase 11: Modos Autônomo/Assistente
**Goal**: Em modo autônomo (default), o agente seleciona o próprio objetivo da hierarquia sem intervenção humana (self-prompting) e NÃO fica grudado em nenhum jogador; sob pedido direto no chat entra em modo assistente (objetivo de alta prioridade com condição-de-saída), executa, e volta sozinho ao autônomo — preservando persona/relacionamento.
**Depends on**: Phase 10 (precisa de objetivos autônomos reais da tech-tree para "fazer suas coisas")
**Requirements**: MODE-01, MODE-02, MODE-03, MODE-04, MODE-05
**Success Criteria** (what must be TRUE):
  1. Sem pedido pendente, o agente seleciona um objetivo da hierarquia (need/tech) e se afasta do jogador para fazer suas coisas — TESTE DE REGRESSÃO AO VIVO "não gruda" passa (mata a regressão do GoalFollow/socializing do v1.0)
  2. Sob pedido direto no chat (ex: "traz madeira", "quebra esse bloco"), o agente entra em modo assistente e executa a tarefa como `Goal{source:player_request}` de alta prioridade
  3. Ao concluir (progress>=1) ou expirar (TTL) o pedido, o agente descarta o objetivo-assistente e volta sozinho ao modo autônomo — sem máquina de modos paralela
  4. A transição autônomo↔assistente preserva personalidade/relacionamento (coerente com a persona; reversão de disposition limpa)
**Plans**: TBD

### Phase 11.1: LLM recebe posições e distâncias de blocos, mobs e entidades (percepção espacial no contexto user/human) (INSERTED)

**Goal:** O LLM passa a saber **o que tem em volta dele com posição e distância** (blocos, mobs e entidades) — em vez de ficar adivinhando. Hoje o contexto enviado (`serializeContext` em src/llm/prompts.ts) manda só `nome×contagem` dos blocos (descarta os `examples`/coordenadas que o snapshot já tem) e só distância (sem posição) para mobs/entidades/jogadores. Sem noção espacial, o LLM decide às cegas: manda coletar um tronco sem saber se está a 2m ou 30m, no chão ou no topo de uma árvore (inalcançável) — uma das causas-raiz do "bot parado". Esta fase enriquece o contexto **user/human** com posições/distâncias para que o LLM decida com noção de perto/longe e alcançável/inalcançável.
**Why:** Para o LLM saber o que existe ao redor e parar de adivinhar — decisões espaciais ruins (alvos inalcançáveis) hoje derrubam o bot em explore/idle.
**How:** Não descartar `nearbyBlockTypes[].examples` na serialização; incluir posição/distância do exemplo mais próximo por tipo de bloco e a posição (não só distância) de mobs/entidades. Entra como mensagem **user/human** (contexto), nunca como assistant.
**Requirements**: TBD
**Depends on:** Phase 11
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 11.1 to break down)

### Phase 12: Building Deliberado
**Goal**: O agente implementa o estado `building` real (hoje stub) além do abrigo de emergência reflexo: constrói um abrigo funcional e estruturas simples (parede/torre/posicionar estação), reusando o primitivo `placeBlock` robusto da Fase 9.
**Depends on**: Phase 9 (placeBlock robusto), Phase 11 (building é um objetivo autônomo selecionável)
**Requirements**: BUILD-02, BUILD-03
**Success Criteria** (what must be TRUE):
  1. O agente constrói um abrigo funcional via estado `building` real — fecha de verdade (sem buracos, sem auto-sufocar), validado por `blockAt` ao redor
  2. O agente constrói estruturas simples (parede / torre / posicionar estação) de forma autônoma
  3. A navegação do building (buscar referência, posicionar-se) herda os bounds do pathfinder do 999.1 e respeita o pacing anti-cheat (colocar blocos em rajada é flagável); sem OOM em soak
**Plans**: TBD
**UI hint**: no

### Phase 13: Combate Completo
**Goal**: O agente implementa o estado `fighting` real (hoje stub) contra mobs hostis via API nativa (`bot.attack` + pathfinder, sem mineflayer-pvp): ataca, mantém/recupera o alvo, recua quando necessário e usa arma+armadura adequadas — sem morrer num combate que devia ter recusado.
**Depends on**: Phase 8 (sobrevivência reflexa provada — "hora de atacar, não só fugir"; vida-crítica preempta o combate e foge)
**Requirements**: FIGHT-01, FIGHT-02, FIGHT-03
**Success Criteria** (what must be TRUE):
  1. O agente entra em estado de combate (fighting) real contra mobs hostis (não mais stub)
  2. O agente ataca respeitando o cooldown (~0.6s), re-valida/re-seleciona o alvo antes de cada golpe e recua quando necessário (sem kiting suicida; sem bater no ar em alvo stale)
  3. Com vida crítica, o System 1 (Fase 8) preempta o combate e foge/abriga — o bot não morre com comida/vida disponível por não desengajar
  4. O agente usa ferramenta/arma (`mineflayer-tool`) e armadura adequadas; a navegação de aproximação/recuo herda os bounds do pathfinder do 999.1
**Plans**: TBD

### Phase 14: Aprendizado por Reflexão (loop fechado)
**Goal**: O agente fecha o loop de aprendizado por experiência PRÓPRIA: reflete sobre mortes/falhas/sucessos grounded e essas lições influenciam observavelmente a seleção de objetivos futuros — com o live-verify da Fase 4 (Known Gap do v1.0) resolvido como gate de entrada.
**Depends on**: Phase 7 (grounding — refletir sobre fatos, não alucinações), Phase 8 (re-teste do reflect pós-System 1), Phase 10 (tech-tree gera falhas reais para refletir sobre)
**Requirements**: LRN-01, LRN-02, LRN-03
**Success Criteria** (what must be TRUE):
  1. GATE DE ENTRADA: a reflexão e a persistência da Fase 4 são verificadas AO VIVO (fecha o Known Gap do v1.0) — `[reflect]` dispara ao vivo, a recuperação semântica (KNN) retorna lições relevantes, perfis persistem e são lidos após kill duro
  2. O agente reflete sobre a própria experiência (mortes/falhas/sucessos grounded) — sem observar/imitar outros jogadores
  3. As lições da reflexão influenciam observavelmente a seleção de objetivos futuros — critério é a INFLUÊNCIA, não só o registro (ex: "morri sem abrigo → priorizo abrigo na próxima noite", observável ao vivo)
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 6 → 7 → 7.1 → 8 → 8.1 → 9 → 10 → 11 → 11.1 → 12 → 13 → 14

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 6. LLM Provider Factory | v2.0 | 0/3 | Planned | - |
| 7. Grounding + SkillResult | v2.0 | 0/4 | Planned | - |
| 7.1. Loop Agêntico | v2.0 | 0/4 | Planned | - |
| 8. System 1 — Sobrevivência Reflexa | v2.0 | 0/TBD | Not started | - |
| 8.1. Refatoração da memória (ChromaDB + fiação + POIs + morte) (INSERTED) | v2.0 | 0/6 | Planned | - |
| 9. Placement + Crafting/Smelting Grounded | v2.0 | 0/TBD | Not started | - |
| 10. Tech Tree DAG + Needs | v2.0 | 0/TBD | Not started | - |
| 11. Modos Autônomo/Assistente | v2.0 | 0/TBD | Not started | - |
| 11.1. Percepção espacial no contexto do LLM (INSERTED) | v2.0 | 0/TBD | Not started | - |
| 12. Building Deliberado | v2.0 | 0/TBD | Not started | - |
| 13. Combate Completo | v2.0 | 0/TBD | Not started | - |
| 14. Aprendizado por Reflexão | v2.0 | 0/TBD | Not started | - |

## Research Flags

Fases que provavelmente precisam de `/gsd:research-phase` no planejamento (da pesquisa, confiança HIGH):

- **Phase 10 (Tech Tree DAG):** parte mais difícil — resolução recursiva de receitas com minecraft-data, estações como nós, profundidade/memo. Ponto mais provável de pesquisa profunda.
- **Phase 13 (Combate):** orquestração manual de combate sem mineflayer-pvp (cooldown ~0.6s, re-seleção de alvo, kiting, desengajar) — superfície de falha alta.
- **Phase 14 (Aprendizado):** depende de resolver o Known Gap não-verificado da Fase 4 ao vivo; precisa de protocolo de verificação de influência, não só de registro.

Fases com padrões bem documentados (provavelmente skip research-phase): 6 (Provider), 7 (Grounding), 8-9 (System 1 / placement / craft-smelt).
