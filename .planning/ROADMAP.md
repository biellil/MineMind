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
  4. As chamadas cloud respeitam um teto de gasto/frequência configurável (contador de tokens/sessão + gate de invocação + `reasoning.effort` baixo como default cloud) — a fatura não escala com o bot parado
**Plans**: TBD

### Phase 7: Grounding + SkillResult
**Goal**: Toda skill retorna um resultado verificado por delta real de inventário/mundo, e o agente só relata (chat/memória) o que o estado confirma — eliminando a alucinação "peguei 10 tábuas" que corromperia a tech-tree e o aprendizado.
**Depends on**: Phase 6
**Requirements**: GRND-01, GRND-02, GRND-03, GRND-04
**Success Criteria** (what must be TRUE):
  1. Cada skill retorna um `SkillResult` cujo `ok` deriva de `observed` (delta de inventário/posição/bloco antes-depois), nunca da resolução da Promise
  2. As skills existentes navigate/dig/follow/attack são convertidas para retornar `SkillResult` grounded (generaliza o `progressChecker` do dig)
  3. Ao vivo, o que o bot diz no chat e grava na memória bate com o inventário real do jogo em centenas de ações (o "peguei 10 tábuas" não ocorre mais)
  4. Uma ação cujo `observed` não satisfaz o `expected` é registrada na memória como falha (não como sucesso)
**Plans**: TBD

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
**Plans**: TBD
**UI hint**: no

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
Phases execute in numeric order: 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 6. LLM Provider Factory | v2.0 | 0/TBD | Not started | - |
| 7. Grounding + SkillResult | v2.0 | 0/TBD | Not started | - |
| 8. System 1 — Sobrevivência Reflexa | v2.0 | 0/TBD | Not started | - |
| 9. Placement + Crafting/Smelting Grounded | v2.0 | 0/TBD | Not started | - |
| 10. Tech Tree DAG + Needs | v2.0 | 0/TBD | Not started | - |
| 11. Modos Autônomo/Assistente | v2.0 | 0/TBD | Not started | - |
| 12. Building Deliberado | v2.0 | 0/TBD | Not started | - |
| 13. Combate Completo | v2.0 | 0/TBD | Not started | - |
| 14. Aprendizado por Reflexão | v2.0 | 0/TBD | Not started | - |

## Research Flags

Fases que provavelmente precisam de `/gsd:research-phase` no planejamento (da pesquisa, confiança HIGH):

- **Phase 10 (Tech Tree DAG):** parte mais difícil — resolução recursiva de receitas com minecraft-data, estações como nós, profundidade/memo. Ponto mais provável de pesquisa profunda.
- **Phase 13 (Combate):** orquestração manual de combate sem mineflayer-pvp (cooldown ~0.6s, re-seleção de alvo, kiting, desengajar) — superfície de falha alta.
- **Phase 14 (Aprendizado):** depende de resolver o Known Gap não-verificado da Fase 4 ao vivo; precisa de protocolo de verificação de influência, não só de registro.

Fases com padrões bem documentados (provavelmente skip research-phase): 6 (Provider), 7 (Grounding), 8-9 (System 1 / placement / craft-smelt).
