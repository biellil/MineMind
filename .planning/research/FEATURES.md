# Feature Research

**Domain:** Autonomous "self-playing" Minecraft agent — milestone v2.0 "Autonomia de Verdade" (bot joga como um player real: sobrevive, progride na tech tree, constrói, combate, alterna autônomo↔assistente)
**Researched:** 2026-06-19
**Confidence:** HIGH (prior art well-documented: Voyager/MineDojo, GITM, Odyssey, mc-agents System 1/2, Mindcraft; mineflayer plugin ecosystem verified live in v1.0)

> **Note on "users":** MineMind é projeto de PESQUISA, não produto comercial. "Table stakes" aqui = *"sem isto o bot não é um player autônomo — é um boneco que vaga e morre."* "Differentiators" = *"o que faz o MineMind um agente que aprende com a própria experiência, não um clone de Voyager."* As categorias são medidas contra a prior art e contra **o que o v1.0 já entregou** (loop cognitivo, chat, navegação, coleta, memória/reflexão/persistência, estados Idle/Exploring/Gathering/Socializing/Reflecting).

## What v1.0 Already Provides (do NOT re-specify)

| Capability | Status | v2.0 builds on it by… |
|------------|--------|------------------------|
| Loop cognitivo (Observe→Analyze→UpdateMemory→Plan→Execute→Reflect) via LangGraph | ✅ | Adicionar nós/estados de sobrevivência, progressão, building, combate; alimentar o Plan com a hierarquia de objetivos |
| Arbiter reativo (segue/vaga como fallback) | ✅ (imaturo) | Promover a uma camada reflexa real (System 1) que cuida de sobrevivência sem esperar o LLM |
| Chat pt-BR (lê e responde) | ✅ | Canal de entrada do **modo assistente** (pedido direto) |
| Navegação (pathfinder) + coleta (collectblock) | ✅ | Primitivas para gathering dentro da cadeia de tech tree |
| Memória curto/longo/semântica + perfis + personalidade + reflexão | ✅ (live-verify pendente) | Reflexão passa a ajustar decisões futuras (aprendizado por experiência própria) |
| Estados Idle/Exploring/Gathering/Socializing/Reflecting | ✅ | Implementar de fato Building e Fighting (hoje stub); adicionar Surviving/Crafting |
| Provider LLM (LM Studio local) | ✅ | Abstração GPT/OpenAI + local (já em REQUIREMENTS) |

## Prior Art Map — focado nas features do v2.0

| Project | What it solves for v2.0 | Padrão a adotar / evitar |
|---------|--------------------------|---------------------------|
| **Voyager** (MineDojo, 2023) | Tech tree wood→stone→iron→diamond via **automatic curriculum** + skill library + **self-verification critic** + error-feedback retry | ADOTAR: curriculum que propõe a próxima tarefa pelo estado do mundo/inventário; self-verify pelo estado real. EVITAR: skill library de código JS gerado pelo LLM (anti-feature já fixada no v1.0) |
| **GITM** (Ghost in the Minecraft, 2023) | Decompõe metas em **DAG de pré-requisitos** ("Material" e "Tool" como nós-pai); destrava os 262 itens do Overworld | ADOTAR: tech tree como grafo de dependências resolvido recursivamente (objetivos hierárquicos do PROJECT.md) |
| **mc-agents** (Claude + Mineflayer) | **System 1 / System 2**: processo Node persistente cuida de sobrevivência (come, foge/luta, cava abrigo) SEM esperar o LLM; LLM faz planejamento/craft/mine; estado real flui por `status.json`/`events.json` | ADOTAR como arquitetura-mãe do v2.0: reflexo rápido (sobrevivência) + deliberação lenta (LLM) + grounding por estado real. É o sibling mais próximo do problema do MineMind |
| **Odyssey / HERAKLES** (2024-25) | Skill compilation hierárquica, biblioteca de skills aberta sobre mineflayer | Referência para skills compostas; manter primitivas hand-authored (não code-gen) |
| **Mindcraft** | **Self-prompting** (define metas sozinho e continua) + modo comando (player injeta tarefa); profiles de personalidade; memória JSON | ADOTAR: self-prompting = modo autônomo; injeção de tarefa = modo assistente. Validador do stack all-JS local |

---

## Feature Landscape

### Table Stakes (sem isto o bot não é um "player autônomo")

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Sobrevivência reflexa — comer** | Sem comida a fome esgota → dano → morte; um "player" que morre de fome em 20 min não joga | LOW | `mineflayer-auto-eat` (plugin pronto). Deve rodar na camada reflexa (System 1), não esperar tick do LLM. Depende de: percepção de hunger (já existe) |
| **Sobrevivência reflexa — gerenciar vida / fugir-defender de mob** | Mob hostil mata em segundos; reação tem que ser sub-segundo, abaixo da latência do LLM | MEDIUM | Reflexo: detecta mob hostil próximo → foge (pathfinder away) ou ataca (pvp) por regra; só escala pro LLM o que é estratégico. mc-agents valida exatamente este split |
| **Abrigo noturno (shelter básico)** | À noite spawnam hostis; um player real se abriga ou ilumina. "Cavar buraco e tampar" é o mínimo viável | MEDIUM | mc-agents trata como "dig a shelter as a last resort" reflexo. Placement de blocos = pré-requisito de Building. Depende de: ter blocos no inventário |
| **Crafting + smelting** | Sem crafting não há tech tree; tábuas→bancada→ferramentas→fornalha→fundir minério | MEDIUM | Mineflayer expõe `craft`, `placeBlock`, furnace API nativamente. Grounding crítico aqui (o bug "peguei 10 tábuas" é exatamente craft não-verificado) |
| **Cadeia de tech tree (wood→stone→iron→diamond)** | É o objetivo central declarado do milestone ("progride sozinho") | HIGH | Cadeia de objetivos com pré-requisitos (Material/Tool DAG, à la GITM). Depende de: gathering (✅), crafting, building (mesa/fornalha), navegação (✅) |
| **Grounding de ações (relato = mundo real)** | Known Gap explícito do v1.0; sem isso a memória/reflexão registra ações que nunca aconteceram → corrompe o aprendizado | MEDIUM–HIGH | Toda primitiva retorna resultado verificado (inventário antes/depois, posição, eventos). LLM só relata o que o estado confirma. Padrão mc-agents `status.json`/`events.json`; padrão Voyager error-feedback |
| **Modo Autônomo como default (self-prompting)** | Core Value: "permanece ativo sem intervenção humana". Hoje o bot tende a grudar/vagar — contradiz o estudo | MEDIUM | Loop seleciona objetivo da hierarquia quando não há pedido; Mindcraft self-prompting é o padrão. Depende de: hierarquia de objetivos + needs |
| **Modo Assistente temporário (sob pedido, volta sozinho)** | Declarado no milestone; player pede "traz madeira" e o bot atende e RETORNA ao autônomo | MEDIUM | Pedido vira objetivo de alta prioridade com TTL/condição-de-saída; ao concluir, descarta e volta ao curriculum. Entrada via chat (✅). Cuidado: NÃO virar bot-de-comando permanente |
| **Estados Building e Fighting implementados de fato** | Listados como cognitive states do projeto, hoje stub; sem eles a máquina de estados está incompleta | MEDIUM | Building = placeBlock estruturado; Fighting = `mineflayer-pvp` + `mineflayer-tool`. Integração de plugins, não invenção |

### Differentiators (o que faz o MineMind um agente que *vive e aprende*, não um Voyager/GITM clone)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Objetivos hierárquicos guiados por needs internos** | Voyager/GITM usam curriculum/DAG puramente orientado a *tarefa*; MineMind escolhe a próxima meta por **pressão de necessidade interna** (fome→comida, perigo→abrigo, escassez→minerar) + dependências. É o "ser vivo" vs "task-runner" | MEDIUM–HIGH | Funde o needs system (Fase 3 do v1.0) com o DAG de tech tree. Needs reordenam o grafo de objetivos em runtime |
| **Aprendizado por reflexão sobre experiência PRÓPRIA** | O bot ajusta decisões futuras a partir do que aconteceu com *ele* (morri à noite sem abrigo → priorizar abrigo). Diferencia de Voyager (skill code) e de imitação | HIGH | Reusa reflexão da Fase 4: morte/falha/sucesso viram lições recuperadas no Plan. **Restrição dura: NÃO observar/imitar outros players** |
| **Transição autônomo↔assistente coerente com a persona** | Atender um pedido e voltar a "viver" sozinho, mantendo personalidade/relacionamento — payoff emocional que bot-de-comando não tem | MEDIUM | Liga modos + perfis sociais (✅) + personalidade (✅). Diferencial sobre Mindcraft (que é mais task/comando) |
| **Memória de mortes/falhas como sinal de progressão** | "Onde morri", "o que faltou para o pickaxe de ferro" persistido e recuperado — continuidade de identidade aplicada ao gameplay | MEDIUM | Mindcraft guarda deaths/ores em JSON; MineMind já tem memória multi-tier — usar para *informar o curriculum* |

### Anti-Features (NÃO construir — pesquisa/aprendizado, não bot de produção)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Skill library de código JS gerado pelo LLM** (Voyager/Mindcraft `allow_insecure_coding`) | "Deixe o agente escrever as próprias skills" parece poderoso e auto-evolutivo | Code injection no host, debugging não-determinístico, briga com "design limpo e instrutivo". Já é Out of Scope no v1.0 | Primitivas hand-authored que o LLM **seleciona** (tool-calling); skills compostas são código revisado por humano |
| **Observar/imitar outros jogadores como aprendizado** | "Aprender vendo o player jogar" | Restrição EXPLÍCITA do milestone — o aprendizado é por experiência própria/reflexão | Reflexão sobre o próprio histórico (mortes, falhas, sucessos) |
| **Meta de "zerar o jogo" (Nether→End→Ender Dragon)** | Demo impressionante | Out of Scope do v2.0; escopo é sobreviver + tech tree até diamante | Parar em diamante; end-game em milestone futuro |
| **Self-verification só-LLM sem feedback do mundo** | "O LLM se auto-corrige" | Pesquisa recente: auto-correção *intrínseca* sem feedback externo **degrada** a performance (LLM troca respostas certas por erradas) | Verificação ancorada no **estado real** (inventário/posição/eventos), não na opinião do LLM sobre si mesmo |
| **Combate avançado (PvP contra players, hawkeye/bow micro)** | "Combate de verdade" | Superfície de falha alta; servidor é single-player local de pesquisa; foco é sobreviver a mobs | `Fighting` cobre defesa contra mobs hostis (pvp + tool); PvP humano fora de escopo |
| **Building com blueprints/megaestruturas** | Demos de castelos | Planejamento espacial é difícil pra LLM local fraco; não é o cerne do thesis cognitivo | `Building` = abrigo funcional + estruturas simples (parede, torre de bloco, mesa/fornalha posicionadas) |
| **Concurrent/parallel cognitive modules (PIANO completo)** | Responsividade real-time, estado-da-arte | Problema de coerência "diz X faz Y"; o System 1/System 2 do mc-agents já dá responsividade sem multiplicar módulos | Camada reflexa (System 1) + loop sequencial único (System 2). Só revisitar se medir gargalo |
| **Farming/agricultura, comércio com villagers, redstone** | "Player completo faz tudo" | Escopo creep; não serve o thesis (sobreviver + tech tree) | Comida via caça/coleta simples; deixar farming pra depois |

---

## Feature Dependencies

```
Camada reflexa System 1 (NOVA — promove o arbiter atual)
    ├──provê──> Comer (auto-eat)            ─┐
    ├──provê──> Fugir/defender de mob        ├── SOBREVIVÊNCIA ("não morrer")
    └──provê──> Abrigo de emergência        ─┘
                     └──requer──> Placement de blocos ──compartilha-com──> BUILDING

Grounding de ações (primitivas retornam estado verificado)
    └──habilita──> Crafting/Smelting confiável
                       └──requer──> CADEIA TECH TREE (wood→stone→iron→diamond)
                                        ├──requer──> Gathering/coleta (✅ v1.0)
                                        ├──requer──> Navegação (✅ v1.0)
                                        ├──requer──> Building (mesa, fornalha)
                                        └──estruturada-como──> Objetivos hierárquicos (DAG de pré-requisitos)

Needs internos (Fase 3 v1.0) ──reordenam──> Objetivos hierárquicos ──alimentam──> Plan do loop (seleciona estado)

Modo Autônomo (self-prompting) ──consome──> Objetivos hierárquicos
Modo Assistente ──injeta──> Objetivo de alta-prioridade com saída ──ao-concluir──> volta ao Autônomo

Reflexão (✅ Fase 4) ──lê──> mortes/falhas/sucessos ──ajusta──> seleção de objetivos (APRENDIZADO próprio)
Combate (Fighting) ──usa──> mineflayer-pvp + mineflayer-tool + armor-manager
```

### Dependency Notes

- **Sobrevivência exige a camada reflexa (System 1):** comer/fugir não podem esperar o tick do LLM (latência do modelo local). É o aprendizado central do mc-agents. O arbiter reativo imaturo do v1.0 evolui para essa camada — não é peça nova, é promoção da existente.
- **Tech tree exige grounding ANTES de progredir:** se o craft reporta sucesso sem verificar inventário (bug atual "peguei 10 tábuas"), a cadeia de pré-requisitos corrompe (o bot "acha" que tem bancada e tenta fazer ferramenta que falha). Grounding é pré-requisito da progressão, não paralelo.
- **Building e Abrigo compartilham o primitivo placeBlock:** implementar placement uma vez serve abrigo de emergência (reflexo) e Building deliberado (estado). Building deve vir junto/logo após abrigo.
- **Objetivos hierárquicos = ponte entre needs e tech tree:** o DAG de pré-requisitos (GITM) dá a *estrutura* (o que precede o quê); os needs internos (v1.0 Fase 3) dão a *prioridade dinâmica* (o que fazer agora). Um sem o outro = ou task-runner cego ou agente sem rumo.
- **Modo Assistente é um objetivo, não um modo paralelo:** modelar o pedido como objetivo de alta prioridade com condição-de-saída evita uma máquina de modos separada e garante o "volta sozinho". Reusa a hierarquia de objetivos.
- **Aprendizado próprio reusa a reflexão da Fase 4:** não é sistema novo — é fechar o loop reflexão→memória→seleção-de-objetivo. Live-verify da Fase 4 (Known Gap) deve ser resolvido aqui, pois o aprendizado depende dela.

---

## MVP Definition

### Launch With (v2.0 core — valida "joga como player real, não morre")

A linha intransponível: **o bot sobrevive sustentadamente E progride na tech tree sozinho, com relatos verídicos.**

- [ ] **Camera reflexa (System 1):** comer (auto-eat) + fugir/defender de mob + abrigo de emergência — sem isso o bot morre antes de qualquer plano
- [ ] **Grounding de ações:** toda primitiva (mine/craft/smelt/place) retorna estado verificado; LLM relata só o confirmado — destrava o resto da progressão
- [ ] **Crafting + smelting confiável** sobre o grounding
- [ ] **Cadeia tech tree wood→stone→iron** como objetivos hierárquicos com pré-requisitos (diamond pode ser o "esticar" se iron estabilizar)
- [ ] **Modo Autônomo default (self-prompting):** seleciona próxima meta da hierarquia + needs, sem player
- [ ] **Modo Assistente temporário:** atende pedido via chat e volta ao autônomo

### Add After Validation (v2.x)

- [ ] **Building deliberado** (estruturas além do abrigo de emergência) — trigger: placement reflexo estável
- [ ] **Fighting completo** (pvp + tool + armor-manager, mobs hostis) — trigger: sobrevivência reflexa provada, hora de atacar e não só fugir
- [ ] **Aprendizado por reflexão fechando o loop** (mortes/falhas ajustam objetivos) — trigger: reflexão Fase 4 verificada ao vivo + tech tree gerando falhas para refletir sobre
- [ ] **Curriculum adaptativo ao bioma** (à la Voyager: deserto → cacto antes de ferro) — trigger: tech tree base funcionando

### Future Consideration (pós-v2.0)

- [ ] End-game (Nether/End/Ender Dragon) — fora de escopo declarado do v2.0
- [ ] Skills compostas/biblioteca (hand-authored, NÃO code-gen) — só se a progressão exigir reuso
- [ ] Farming/villagers/redstone — escopo creep; só se virar objetivo de pesquisa

---

## Feature Prioritization Matrix

| Feature | Research Value | Implementation Cost | Priority |
|---------|----------------|---------------------|----------|
| Camada reflexa System 1 (comer/fugir/abrigo) | HIGH | MEDIUM | P1 |
| Grounding de ações | HIGH | MEDIUM–HIGH | P1 |
| Crafting + smelting | HIGH | MEDIUM | P1 |
| Cadeia tech tree (objetivos hierárquicos / DAG) | HIGH | HIGH | P1 |
| Modo Autônomo (self-prompting) | HIGH | MEDIUM | P1 |
| Modo Assistente temporário | HIGH | MEDIUM | P1 |
| Building deliberado | MEDIUM | MEDIUM | P2 |
| Fighting completo (pvp/tool/armor) | MEDIUM | MEDIUM | P2 |
| Aprendizado por reflexão (loop fechado) | HIGH | HIGH | P2 |
| Needs reordenando objetivos | HIGH | MEDIUM | P2 |
| Curriculum adaptativo ao bioma | MEDIUM | MEDIUM | P3 |
| LLM code-gen / skill library | LOW | HIGH | (anti) |
| Observar/imitar players | LOW | — | (anti) |
| End-game / PvP humano / blueprints | LOW | HIGH | (anti) |

**Priority key:** P1 = núcleo do v2.0; P2 = adicionar após validação; P3 = futuro.

---

## Competitor Feature Analysis (foco nas features v2.0)

| Feature | Voyager | GITM | mc-agents | Mindcraft | MineMind v2.0 |
|---------|---------|------|-----------|-----------|----------------|
| Sobrevivência | Implícita no curriculum | Implícita | **Reflexo System 1** (come/foge/abriga sem LLM) | Reflexo + LLM | **Camada reflexa System 1** promovendo o arbiter atual |
| Tech tree | Auto-curriculum + skill code | **DAG de pré-requisitos** (262 itens) | tools.mine/craft/smelt via LLM-code | Self-prompting de goal-item | **DAG hierárquico + needs internos** reordenando |
| Grounding | Error-feedback + self-verify critic | Estado textual | **status.json/events.json estado real** | Memória sumarizada | **Primitivas retornam estado verificado** (mata o "peguei 10 tábuas") |
| Building | Code-gen | DAG inclui estruturas | shelter reflexo | Blueprint goal | placeBlock estruturado (abrigo→estruturas simples) |
| Combate | — | — | luta/foge reflexo | pvp via comando | pvp+tool+armor (defesa de mob, P2) |
| Autônomo↔Assistente | Só autônomo (curriculum) | Só tarefa | Autônomo | **Self-prompt (auto) + comando (assist)** | **Autônomo default + assistente temporário com volta** |
| Aprendizado | Skill library (código) | Memória textual | MEMORY.md por ciclo | Memória JSON sumarizada | **Reflexão sobre experiência PRÓPRIA** (sem imitar) |
| Stack | Python/GPT-4 | Python | Node + Claude | Node/JS + 15 providers | All-TS (Bun+mineflayer+LangGraph), LM Studio + GPT |

**Key takeaways para o roadmap:**
1. **A arquitetura System 1 / System 2 do mc-agents é o padrão a adotar para sobrevivência** — separa reflexo rápido (não morrer) de deliberação lenta (LLM planeja). Resolve diretamente o Known Gap "o bot fica no arbiter reativo e o LLM alucina ações": o arbiter VIRA o System 1 (legítimo), e o grounding conserta o System 2.
2. **Tech tree = DAG de pré-requisitos (GITM) priorizado por needs (MineMind Fase 3)** — não inventar; combinar estrutura (GITM) com motivação interna (já é o diferencial do MineMind).
3. **Grounding é pré-requisito de TUDO em progressão**, não um item paralelo — sem ele a cadeia de objetivos corrompe.
4. **Não copiar a code-gen do Voyager/Mindcraft** (anti-feature confirmada) nem confiar em self-verification só-LLM (degrada sem feedback do mundo) — ancorar no estado real.
5. **Modo assistente = objetivo de alta prioridade com saída**, não uma máquina de modos paralela — reusa a hierarquia e garante o "volta sozinho".

## Sources

- [Voyager — arXiv 2305.16291](https://arxiv.org/abs/2305.16291) / [project site](https://voyager.minedojo.org/) — tech tree wood→stone→iron→diamond, auto-curriculum, self-verification critic, error-feedback retry — HIGH
- [GITM — Ghost in the Minecraft, arXiv 2305.17144](https://arxiv.org/pdf/2305.17144) / [OpenReview](https://openreview.net/pdf?id=cTOL99p5HL) — decomposição em DAG de pré-requisitos (Material/Tool), 262 itens do Overworld — HIGH
- [mc-agents (Claude + Mineflayer)](https://github.com/jblemee/mc-agents) — System 1 (reflexo: come/foge/abriga) vs System 2 (LLM planeja/crafta/minera), grounding via status.json/events.json, tools.mine/craft/smelt/shelter — HIGH
- [Mindcraft — GitHub mindcraft-bots/mindcraft](https://github.com/mindcraft-bots/mindcraft) — self-prompting (autônomo) + modo comando (assistente), memória JSON, profiles — HIGH
- [Odyssey — arXiv 2407.15325](https://arxiv.org/pdf/2407.15325) / [HERAKLES — arXiv 2508.14751](https://arxiv.org/pdf/2508.14751) — skill hierárquica sobre mineflayer — MEDIUM
- [mineflayer plugins](https://github.com/PrismarineJS/mineflayer) — auto-eat, pvp, tool, armor-manager, hawkeye, collectblock, pathfinder (Java only) — HIGH
- [Minecraft AI: Bridging LLMs with Mineflayer (typevar.dev)](https://typevar.dev/articles/mindcraft-bots/mindcraft) — validação do stack all-JS + local LLM — MEDIUM
- Limitação de self-correction intrínseca ([discussão em torno de Voyager / pesquisa de auto-correção LLM](https://arxiv.org/html/2305.16291)) — auto-verificação sem feedback externo degrada — MEDIUM

---
*Feature research for: autonomous self-playing Minecraft agent — milestone v2.0*
*Researched: 2026-06-19*
