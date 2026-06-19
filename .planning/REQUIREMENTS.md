# Requirements: MineMind — Milestone v2.0 "Autonomia de Verdade"

**Defined:** 2026-06-19
**Core Value:** O agente permanece ativo de forma autônoma, percebe o mundo e age sobre ele com base em objetivos próprios e memória — sem intervenção humana.

> **Nota sobre "usuário":** MineMind é projeto de PESQUISA. A maioria dos requisitos descreve comportamentos observáveis do **agente** (o "player" autônomo). "Testável" = verificável ao vivo no mundo ou por teste automatizado.

## v2.0 Requirements

Escopo comprometido deste milestone. Cada requisito mapeia para uma fase do roadmap.

### Provider LLM (PROV)

- [ ] **PROV-01**: O agente pode usar GPT-4.1-mini (OpenAI cloud) como provider de raciocínio, selecionável por env/config
- [ ] **PROV-02**: O agente mantém LM Studio local como provider default custo-zero, trocável sem alterar o loop cognitivo
- [ ] **PROV-03**: Os embeddings permanecem locais (custo-zero) independentemente do provider de chat ativo
- [ ] **PROV-04**: O structured output (Zod) produz saída válida em ambos os providers (paridade verificada)
- [ ] **PROV-05**: As chamadas cloud respeitam um teto de gasto/frequência configurável (proteção do loop sempre-ativo)

### Grounding de Ações (GRND)

- [ ] **GRND-01**: Toda skill retorna um resultado verificado (SkillResult) baseado em delta real de inventário/mundo, não na resolução da Promise
- [ ] **GRND-02**: O agente relata (chat/memória) apenas ações que o estado do mundo confirma — acaba a alucinação "peguei 10 tábuas"
- [ ] **GRND-03**: As skills existentes (navigate/dig/follow/attack) são convertidas para retornar SkillResult
- [ ] **GRND-04**: Uma ação cujo resultado não satisfaz o esperado é registrada como falha (não como sucesso)

### Sobrevivência — Camada Reflexa System 1 (SURV)

- [ ] **SURV-01**: O agente come automaticamente antes de a fome causar dano, como reflexo (sem esperar o tick do LLM)
- [ ] **SURV-02**: O agente detecta mob hostil próximo e reage (foge ou defende) em sub-segundo, sem esperar o LLM
- [ ] **SURV-03**: O agente se abriga à noite / em perigo (abrigo de emergência) para não morrer de mobs noturnos
- [ ] **SURV-04**: O agente evita perigos ambientais (lava, queda, afogamento) via guardas reflexos
- [ ] **SURV-05**: O reflexo (System 1) tem precedência sobre a ação deliberada sem bloquear a inferência do LLM (preempção, não fila)

### Crafting & Smelting (CRAFT)

- [ ] **CRAFT-01**: O agente crafta itens verificando o inventário antes/depois (grounded)
- [ ] **CRAFT-02**: O agente posiciona e usa a bancada de trabalho quando a receita exige (3x3)
- [ ] **CRAFT-03**: O agente funde minérios na fornalha (smelting) e recupera o resultado
- [ ] **CRAFT-04**: O agente equipa a ferramenta/armadura apropriada do inventário

### Progressão / Tech Tree (TECH)

- [ ] **TECH-01**: O agente resolve os pré-requisitos de um item-alvo recursivamente (DAG de dependências via minecraft-data)
- [ ] **TECH-02**: O agente progride a cadeia madeira → pedra → ferro de forma autônoma (diamante como esticar)
- [ ] **TECH-03**: Os objetivos têm dependências explícitas (Goal.dependsOn preenchido) e são selecionados respeitando-as
- [ ] **TECH-04**: As necessidades internas (needs) reordenam dinamicamente a prioridade dos objetivos em runtime
- [ ] **TECH-05**: O agente minera com a ferramenta correta para o tier (pré-flight de ferramenta antes de minerar)

### Modos Autônomo / Assistente (MODE)

- [ ] **MODE-01**: Em modo autônomo (default), o agente seleciona o próprio objetivo da hierarquia sem intervenção humana (self-prompting)
- [ ] **MODE-02**: O agente NÃO fica grudado/seguindo um jogador quando não há pedido (sem a regressão do "grude")
- [ ] **MODE-03**: Sob pedido direto no chat (ex: "traz madeira", "quebra esse bloco"), o agente entra em modo assistente e executa a tarefa
- [ ] **MODE-04**: Ao concluir (ou expirar) a tarefa do pedido, o agente volta sozinho ao modo autônomo
- [ ] **MODE-05**: A transição autônomo↔assistente preserva personalidade/relacionamento (coerente com a persona)

### Building (BUILD)

- [ ] **BUILD-01**: O agente coloca blocos de forma confiável (placeBlock com verificação e timeout)
- [ ] **BUILD-02**: O agente constrói um abrigo funcional (estado building real, além do abrigo de emergência reflexo)
- [ ] **BUILD-03**: O agente constrói estruturas simples (parede / torre / posicionar estação)

### Combate (FIGHT)

- [ ] **FIGHT-01**: O agente entra em estado de combate (fighting) real contra mobs hostis
- [ ] **FIGHT-02**: O agente ataca, mantém/recupera o alvo e recua quando necessário (sem kiting suicida)
- [ ] **FIGHT-03**: O agente usa ferramenta/arma e armadura adequadas no combate

### Aprendizado por Reflexão (LRN)

- [ ] **LRN-01**: O agente reflete sobre a própria experiência (mortes/falhas/sucessos grounded) — sem observar/imitar outros jogadores
- [ ] **LRN-02**: As lições da reflexão influenciam observavelmente a seleção de objetivos futuros (ex: "morri sem abrigo → priorizo abrigo")
- [ ] **LRN-03**: A reflexão e a persistência da Fase 4 são verificadas AO VIVO (fecha o Known Gap do v1.0)

## Futuro (v2.x — reconhecido, fora deste roadmap)

### Progressão Adaptativa (TECH futuro)

- **TECH-F1**: Curriculum adaptativo ao bioma (ex: deserto → cacto antes de ferro)
- **TECH-F2**: Esticar a tech tree além de diamante (sem chegar ao end-game)

### Skills Compostas (BUILD/CRAFT futuro)

- **SKILL-F1**: Biblioteca de skills compostas *hand-authored* (NÃO code-gen) — só se a progressão exigir reuso

## Out of Scope

Exclusões explícitas. Documentadas para prevenir scope creep.

| Feature | Reason |
|---------|--------|
| Skill library de código JS gerado pelo LLM (estilo Voyager `allow_insecure_coding`) | Code injection no host, debugging não-determinístico, contradiz "design limpo e instrutivo" |
| Observar/imitar outros jogadores como aprendizado | Restrição EXPLÍCITA do usuário — o aprendizado é por experiência própria/reflexão |
| Zerar o jogo (Nether → End → Ender Dragon) | Escopo do v2.0 é sobreviver + tech tree até diamante; end-game em milestone futuro |
| Self-verification só-LLM sem feedback do mundo | Auto-correção intrínseca sem feedback externo degrada a performance; ancorar no estado real |
| PvP contra jogadores humanos / micro de arco (hawkeye) | Foco é sobreviver a mobs; servidor single-player local de pesquisa |
| Building com blueprints / megaestruturas | Planejamento espacial é difícil para LLM local fraco; não é o cerne do thesis cognitivo |
| Módulos cognitivos concorrentes (PIANO completo) | System 1/2 já dá responsividade sem o problema de coerência "diz X faz Y" |
| Farming / comércio com villagers / redstone | Scope creep; não serve o thesis (sobreviver + tech tree) |
| `mineflayer-pvp` / `mineflayer-auto-eat` (plugins) | Abandonados (~4 anos); escondem a lógica que é o objeto de estudo — usar API nativa |
| Backend Python / ponte cross-process | Stack all-TypeScript já validada |
| Minecraft Bedrock Edition | Mineflayer suporta apenas Java Edition |

## Traceability

Quais fases cobrem quais requisitos. Preenchido durante a criação do roadmap.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PROV-01 | — | Pending |
| PROV-02 | — | Pending |
| PROV-03 | — | Pending |
| PROV-04 | — | Pending |
| PROV-05 | — | Pending |
| GRND-01 | — | Pending |
| GRND-02 | — | Pending |
| GRND-03 | — | Pending |
| GRND-04 | — | Pending |
| SURV-01 | — | Pending |
| SURV-02 | — | Pending |
| SURV-03 | — | Pending |
| SURV-04 | — | Pending |
| SURV-05 | — | Pending |
| CRAFT-01 | — | Pending |
| CRAFT-02 | — | Pending |
| CRAFT-03 | — | Pending |
| CRAFT-04 | — | Pending |
| TECH-01 | — | Pending |
| TECH-02 | — | Pending |
| TECH-03 | — | Pending |
| TECH-04 | — | Pending |
| TECH-05 | — | Pending |
| MODE-01 | — | Pending |
| MODE-02 | — | Pending |
| MODE-03 | — | Pending |
| MODE-04 | — | Pending |
| MODE-05 | — | Pending |
| BUILD-01 | — | Pending |
| BUILD-02 | — | Pending |
| BUILD-03 | — | Pending |
| FIGHT-01 | — | Pending |
| FIGHT-02 | — | Pending |
| FIGHT-03 | — | Pending |
| LRN-01 | — | Pending |
| LRN-02 | — | Pending |
| LRN-03 | — | Pending |

**Coverage:**
- v2.0 requirements: 37 total
- Mapped to phases: 0 (preenchido pelo roadmapper)
- Unmapped: 37 ⚠️ (até o roadmap)

---
*Requirements defined: 2026-06-19*
*Last updated: 2026-06-19 after initial definition (milestone v2.0)*
