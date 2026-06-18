# MineMind

## What This Is

MineMind é um agente autônomo persistente que vive dentro do Minecraft. Diferente de bots tradicionais orientados por comandos, ele possui objetivos próprios, memória de longo prazo, personalidade evolutiva e capacidade de tomar decisões independentes — uma entidade digital que existe continuamente em um mundo Minecraft, interagindo com jogadores e com o ambiente de forma natural. O projeto é uma exploração de pesquisa/aprendizado sobre arquiteturas de agentes, sistemas de memória e orquestração cognitiva.

## Core Value

O agente permanece ativo de forma autônoma, percebe o mundo e age sobre ele com base em objetivos próprios e memória — sem intervenção humana. Se tudo mais falhar, o loop cognitivo (perceber → decidir → agir) precisa funcionar.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(Nenhum ainda — entregar para validar)

### Active

<!-- Current scope. Building toward these. -->

- [ ] Conectar-se a um servidor Minecraft Java e permanecer online
- [ ] Ler o chat e responder mensagens de jogadores de forma coerente
- [ ] Mover-se e navegar autonomamente pelo mundo
- [ ] Manter memória de curto prazo (eventos/conversas/ações recentes)
- [ ] Loop cognitivo básico funcionando (Observe → Analyze → Update Memory → Plan → Execute → Reflect)
- [ ] Integração com LLM local via LM Studio para raciocínio e conversação

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Backend em Python / ponte cross-process — escolhido stack all-TypeScript (Mineflayer + @langchain/langgraph no mesmo processo) para simplicidade de integração
- Provedores de LLM em nuvem (Claude/GPT/Gemini/etc.) como alvo de v1 — foco inicial em LM Studio local; nuvem fica para depois via abstração de provedor
- Servidores públicos/multiplayer reais em v1 — desenvolvimento em servidor Java local para controle e testes
- Personalidade adaptativa avançada, aprendizado contínuo e reflexão complexa — fases posteriores do MVP (Fase 4)
- Minecraft Bedrock Edition — Mineflayer suporta apenas Java Edition

## Context

- **Idioma:** Comunicação do projeto em pt-BR.
- **Origem:** PRD detalhado já existente em `README.md` define visão, missão, arquitetura, estados cognitivos, sistemas de necessidades/objetivos/memória, sistema social e MVP em 4 fases.
- **Arquitetura-alvo:** `Minecraft Server → Mineflayer → Action Layer → LangGraph → LLM → Memory Systems`.
- **Estados cognitivos:** Idle, Exploring, Gathering, Building, Socializing, Fighting, Reflecting.
- **Sistemas planejados:** necessidades internas (sobrevivência, recursos, abrigo, curiosidade, socialização), objetivos dinâmicos (prioridade/progresso/dependências/recompensa interna), memória (curto prazo, longo prazo, semântica), perfis sociais por jogador.
- **Em aberto para a pesquisa:** estratégia de persistência da memória de longo prazo e semântica (SQLite? arquivos JSON? vector store com embeddings?).

## Constraints

- **Tech stack**: TypeScript/Node de ponta a ponta — Mineflayer + `@langchain/langgraph` (JS) no mesmo processo — porque Mineflayer é Node-only e queremos uma única linguagem.
- **LLM (v1)**: LM Studio (modelo local) — custo zero e adequado a um loop sempre-ativo; reasoning local é mais fraco que frontier cloud.
- **Plataforma de jogo**: Minecraft Java Edition em servidor local — Mineflayer não suporta Bedrock.
- **Foco do projeto**: pesquisa/aprendizado — priorizar design limpo e instrutivo sobre features impressionantes.

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Stack all-TypeScript (Mineflayer + LangGraph.js) | Mineflayer é Node-only; uma só linguagem evita ponte cross-process | — Pending |
| LLM local via LM Studio como alvo de v1 | Custo zero e sem rate limits para loop sempre-ativo | — Pending |
| Servidor Java local para desenvolvimento | Controle total e testes fáceis | — Pending |
| Foco em pesquisa/aprendizado | Direciona prioridade para clareza arquitetural | — Pending |

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
*Last updated: 2026-06-18 after initialization*
