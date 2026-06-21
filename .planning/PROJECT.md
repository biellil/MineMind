# MineMind

## What This Is

MineMind é um agente autônomo persistente que vive dentro do Minecraft. Diferente de bots tradicionais orientados por comandos, ele possui objetivos próprios, memória de longo prazo, personalidade evolutiva e capacidade de tomar decisões independentes — uma entidade digital que existe continuamente em um mundo Minecraft, interagindo com jogadores e com o ambiente de forma natural. O projeto é uma exploração de pesquisa/aprendizado sobre arquiteturas de agentes, sistemas de memória e orquestração cognitiva.

## Core Value

O agente permanece ativo de forma autônoma, percebe o mundo e age sobre ele com base em objetivos próprios e memória — sem intervenção humana. Se tudo mais falhar, o loop cognitivo (perceber → decidir → agir) precisa funcionar.

## Current Milestone: v2.0 Autonomia de Verdade

**Goal:** Transformar o MineMind num agente que joga Minecraft como um player real — sobrevive (não morre), coleta, crafta e progride na tech tree (madeira → ferro → diamante) por conta própria, sem ficar grudado em ninguém.

**Target features:**
- **Modo Autônomo (padrão):** o bot vive e joga sozinho — coração do estudo.
- **Modo Assistente (temporário):** sob pedido direto de jogador (buscar item, quebrar bloco), atende e volta sozinho ao autônomo ao terminar.
- **Sobrevivência ("não morrer"):** fome/comida, vida, fugir/defender de mobs, abrigo à noite.
- **Progressão / tech tree:** cadeia coleta→craft (madeira→pedra→ferro→diamante) com objetivos mais ricos (hierarquia, dependências).
- **Building:** estado/comportamento de construção real (abrigo, estruturas).
- **Combate:** estado de combate real (defesa e ataque).
- **Mais estados cognitivos:** implementar de fato os estados ainda incompletos/stub.
- **Grounding de ações:** o que o LLM relata reflete o que de fato aconteceu no mundo (acabar com a alucinação "peguei 10 tábuas").
- **Aprendizado por reflexão:** usar a memória/reflexão da Fase 4 para o bot ajustar as próprias decisões — sem observar/imitar outros jogadores.
- **LLM configurável:** GPT (OpenAI) e LM Studio local via abstração de provider (troca por env/config).

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- [x] Loop cognitivo básico funcionando (Observe → Analyze → Update Memory → Plan → Execute → Reflect) — *Validado na Fase 3 (loop com LLM + arbiter fallback; smoke headless + checkpoint ao vivo)*
- [x] Ler o chat e responder mensagens de jogadores de forma coerente — *Validado na Fase 3 (CHAT-01/02 confirmado ao vivo, persona pt-BR)*
- [x] Integração com LLM local via LM Studio para raciocínio e conversação — *Validado na Fase 3 (LLM-01/02/03; degradação graciosa D-17 confirmada ao vivo)*
- [x] Conectar-se a um servidor Minecraft Java e permanecer online (com reconexão) — *Validado na Fase 1 (CONN-01/02; cap de reconexão adicionado pós-v1.0 contra vazamento de RAM)*
- [x] Mover-se e navegar autonomamente pelo mundo — *Validado na Fase 1/2 (ACT-01; pathfinding com bounds de OOM na Fase 999.1)*
- [x] Manter memória de curto prazo (eventos/conversas/ações recentes) — *Validado na Fase 2 (ring buffer limitado)*
- [~] Persistência de longo prazo + semântica (SQLite + sqlite-vec), reflexão, perfis por jogador, personalidade evolutiva — *Entregue na Fase 4 e coberto por testes (227), MAS verificação humana AO VIVO PENDENTE (ver Known Gaps)*
- [x] Grounding de ações: relatos do LLM consistentes com o estado real do mundo — *Validado na Fase 7 (GRND-01..04; toda skill retorna `SkillResult` derivado de delta real, execute node deriva memória do `outcome`, post-filter reescreve quantidades — mata "peguei 10 tábuas"). Métrica de volume ao vivo fica como item não-bloqueante*

### Active

<!-- Current scope. Building toward these. Escopo do milestone v2.0 — REQ-IDs detalhados em REQUIREMENTS.md. -->

- [ ] Modo autônomo como padrão: o bot joga sozinho sem ficar preso a um jogador
- [ ] Modo assistente temporário: atende pedido direto e retorna ao autônomo ao concluir
- [ ] Sobreviver de forma sustentada (comida, vida, mobs hostis, abrigo noturno) — "não morrer"
- [ ] Progredir na tech tree (madeira → pedra → ferro → diamante) com objetivos hierárquicos/dependentes
- [ ] Construir (building) abrigo/estruturas de forma autônoma
- [ ] Combater (defender e atacar) com estado de combate real
- [ ] Implementar de fato os estados cognitivos ainda incompletos
- [ ] Aprender pela própria reflexão/memória (sem observar outros jogadores)
- [ ] Provider de LLM configurável (GPT/OpenAI + LM Studio local)

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Backend em Python / ponte cross-process — escolhido stack all-TypeScript (Mineflayer + @langchain/langgraph no mesmo processo) para simplicidade de integração
- Observar/imitar outros jogadores como mecanismo de aprendizado — o bot aprende pela própria experiência/reflexão (decisão explícita do milestone v2.0)
- Meta final de "zerar o jogo" (Ender Dragon / Nether→End) em v2.0 — escopo deste milestone é sobreviver + tech tree até diamante; o end-game fica para depois
- Servidores públicos/multiplayer reais em v2.0 — desenvolvimento em servidor Java local para controle e testes
- Minecraft Bedrock Edition — Mineflayer suporta apenas Java Edition
- Aprendizado contínuo / fine-tuning do modelo — fora do escopo de pesquisa (o "aprendizado" é via memória/reflexão, não treino de pesos)

## Context

- **Idioma:** Comunicação do projeto em pt-BR.
- **Origem:** PRD detalhado já existente em `README.md` define visão, missão, arquitetura, estados cognitivos, sistemas de necessidades/objetivos/memória, sistema social e MVP em 4 fases.
- **Arquitetura-alvo:** `Minecraft Server → Mineflayer → Action Layer → LangGraph → LLM → Memory Systems`.
- **Estados cognitivos:** Idle, Exploring, Gathering, Building, Socializing, Fighting, Reflecting.
- **Sistemas planejados:** necessidades internas (sobrevivência, recursos, abrigo, curiosidade, socialização), objetivos dinâmicos (prioridade/progresso/dependências/recompensa interna), memória (curto prazo, longo prazo, semântica), perfis sociais por jogador.
- **Em aberto para a pesquisa:** estratégia de persistência da memória de longo prazo e semântica (SQLite? arquivos JSON? vector store com embeddings?).

## Current State

**Shipped: v1.0 MVP — 2026-06-19** · 4 fases + 1 backlog (999.1) · 24 planos · ~7.122 LOC TypeScript · 227 testes (1 fail é teste de config que lê `.env` local).

**v2.0 em andamento — Phase 6 (LLM Provider Factory) completa 2026-06-19:** GPT-4.1-mini (cloud) e LM Studio (local) atrás da mesma interface `LlmProvider`, trocáveis por `LLM_PROVIDER` sem tocar o loop cognitivo; embeddings sempre locais; teto de custo (`withSpendCap`, hard-cap persistido em SQLite → fallback-to-local); paridade de structured-output verificada (schema-only + mock + live). Paridade cloud confirmada ao vivo (GPT-4.1-mini); paridade local live (LM Studio) fica como item HUMAN-UAT pendente.

**Phase 7 (Grounding + SkillResult) completa 2026-06-19:** módulo `grounding/` (contrato `SkillResult` tagueado por `outcome`, `captureGroundState` imutável, avaliadores puros `evaluateDig`/`evaluateNavigate`); as 4 skills (navigate/dig/follow/attack) sempre retornam `SkillResult` grounded e nunca lançam como fluxo normal (D-08/D-12); o execute node deriva a memória do `outcome`/`observed` real em vez da resolução da Promise (bug de raiz morto, D-09 B); `MemEvent` estendido com outcome/observed/expected (D-13); post-filter determinístico reescreve afirmações de quantidade na fala contra o delta real (D-10). 279 testes pass (1 fail pré-existente de config `.env`). Métrica de drift ao vivo (LM Studio + servidor) fica como verificação humana não-bloqueante.

**Phase 08.1 (Refatorar Memória — ChromaDB + Fiação + POIs + Morte) completa 2026-06-21:** consertado o bug de fiação (`persistEvent` nunca chamado → `events=0`) via helper `recordEvent` em 6 call-sites; camada vetorial migrada de sqlite-vec para ChromaDB (`localhost:8000`, circuit breaker hand-rolled que degrada sem abortar o loop); o LLM agora consome memórias recuperadas (KNN top-3 no caminho de AÇÃO, seção `Memórias relevantes:`); memória espacial via `places` com POIs `danger`/`resource`/`village` + busca por proximidade injetada no prompt (`nearbyPlacesString`); evento de morte registrado; tabela de lições como semente da Phase 14. GAP-01 (POIs incompletos) fechado no 08.1-07. 25/25 must-haves verificados; loop central de memória **PASSOU em teste ao vivo** (events>0, reflexão, vetor no Chroma, recall KNN `score=1.89`, morte→death+danger). `base`/`landmark`/criação-de-lições deferidos p/ Phase 14.

A espinha cognitiva (perceber → decidir → agir), o loop com LLM local, e toda a camada de persistência/reflexão/identidade (Fase 4) estão **implementadas e cobertas por testes unitários/smoke**. Persistência ao vivo foi parcialmente comprovada (perfil de jogador + holder gravados em SQLite/WAL).

### Known Gaps (v1.0 shipped com dívida consciente)

- **Phase 4 NÃO verificada ao vivo (human-verify pendente):** marcada concluída a pedido; o `04-07-SUMMARY.md` mantém o registro de que o teste humano em runtime real não passou.
- **Comportamento de runtime imaturo:** ao vivo o bot tende a ficar no arbiter reativo (segue/vaga) e o LLM de conversa alucina ações ("peguei 10 tábuas") — execução real de tarefa + grounding precisam de trabalho (território Fase 2/3).
- **`[reflect]` ao vivo não confirmado:** corrigido o starvation (B1) e o timeout do LLM que segurava o lock, mas falta um re-teste ao vivo limpo confirmando que a reflexão dispara.
- **Requirements traceability não mantida:** a tabela tinha só 5/32 marcados ao arquivar — outcomes reais estão nos SUMMARYs das fases.
- **Workaround de OOM ativo:** `PERCEPTION_RADIUS` reduzido no `.env` local; o fix estrutural (999.1) cobre o dig, mas o raio alto ainda pressiona memória.

## Constraints

- **Tech stack**: TypeScript de ponta a ponta — Mineflayer + `@langchain/langgraph` (JS) no mesmo processo — porque Mineflayer é Node-only e queremos uma única linguagem.
- **Runtime**: Bun como runtime/gerenciador de pacotes (TS nativo, performático), com Node como fallback de compatibilidade caso o Mineflayer apresente casos-limite. A pesquisa deve validar a compatibilidade Bun↔Mineflayer.
- **LLM (v2.0)**: provider configurável — GPT (OpenAI) **e** LM Studio local via abstração. Local é custo-zero para o loop sempre-ativo; GPT entra para reasoning mais forte onde necessário. Trocável por env/config.
- **Plataforma de jogo**: Minecraft Java Edition em servidor local — Mineflayer não suporta Bedrock.
- **Foco do projeto**: pesquisa/aprendizado — priorizar design limpo e instrutivo sobre features impressionantes.

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Stack all-TypeScript (Mineflayer + LangGraph.js) | Mineflayer é Node-only; uma só linguagem evita ponte cross-process | ✅ Validado (Fases 1-3, mesmo processo) |
| Bun como runtime, Node como fallback | TS nativo e velocidade; Mineflayer oficialmente testado em Node | ✅ Validado (Bun 1.3.x ↔ Mineflayer 4.37.1 em MC 1.21.4) |
| LLM local via LM Studio como alvo de v1 | Custo zero e sem rate limits para loop sempre-ativo | ✅ Validado (Fase 3, qwen3-vl-8b ao vivo + degradação D-17) |
| Servidor Java local para desenvolvimento | Controle total e testes fáceis | ✅ Validado (dev e testes ao vivo em MC 1.21.4 local) |
| Foco em pesquisa/aprendizado | Direciona prioridade para clareza arquitetural | ✅ Bom (design limpo priorizado sobre features) |
| Bound do pathfinding da coleta + raio de busca separado do raio de percepção | A* do collectBlock estourava memória (OOM ~78GB) e bloqueava o event loop síncrono no Gathering com `PERCEPTION_RADIUS` alto | ✅ Validado (Fase 999.1: searchRadius/thinkTimeout + pré-check getPathTo; smoke prova sem-OOM/timeout/lag<200ms com raio=32) |
| Persistência: SQLite único (relacional + sqlite-vec) sob bun:sqlite | De-riscar D-01 antes de construir; um arquivo, sem serviço externo, KNN local | ✅ Validado (Fase 4: load + round-trip Float32Array no Windows) |
| Reflexão reusa a deliberação single-flight (não é nó novo do StateGraph) | Uma inferência por vez no modelo local fraco (D-12) | ⚠️ Revisar (starvation B1 corrigido pós-execução; `[reflect]` ao vivo ainda não confirmado) |
| Reconexão sem cap (reconnector canônico) | Simplicidade | ⚠️ Revisar→corrigido (vazava ~24GB com servidor fora; cap de 5 tentativas adicionado) |
| [v2.0] LLM com provider configurável (GPT/OpenAI + LM Studio) | Reasoning local fraco limitava autonomia real; GPT dá reasoning forte mantendo local como opção custo-zero | 🚧 Planejado (revisa a restrição "só local em v1") |
| [v2.0] Modo autônomo é o default; assistente é estado temporário sob pedido | O comportamento de "grudar no jogador" contradiz o core value (autonomia); estudo exige o bot jogando sozinho | 🚧 Planejado |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-21 — Phase 08.1 (Refatorar Memória) completa: events persistem, vetores no ChromaDB, LLM consome memórias via KNN no caminho de AÇÃO, POIs espaciais (danger/resource/village) + morte registrada — loop de memória comprovado ao vivo*
