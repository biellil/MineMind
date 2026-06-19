# MineMind

## What This Is

MineMind é um agente autônomo persistente que vive dentro do Minecraft. Diferente de bots tradicionais orientados por comandos, ele possui objetivos próprios, memória de longo prazo, personalidade evolutiva e capacidade de tomar decisões independentes — uma entidade digital que existe continuamente em um mundo Minecraft, interagindo com jogadores e com o ambiente de forma natural. O projeto é uma exploração de pesquisa/aprendizado sobre arquiteturas de agentes, sistemas de memória e orquestração cognitiva.

## Core Value

O agente permanece ativo de forma autônoma, percebe o mundo e age sobre ele com base em objetivos próprios e memória — sem intervenção humana. Se tudo mais falhar, o loop cognitivo (perceber → decidir → agir) precisa funcionar.

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

### Active

<!-- Current scope. Building toward these. Definir no próximo milestone. -->

(A definir no próximo milestone — ver Known Gaps abaixo para o trabalho de re-verificação/correção pendente.)

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Backend em Python / ponte cross-process — escolhido stack all-TypeScript (Mineflayer + @langchain/langgraph no mesmo processo) para simplicidade de integração
- Provedores de LLM em nuvem (Claude/GPT/Gemini/etc.) como alvo de v1 — foco inicial em LM Studio local; nuvem fica para depois via abstração de provedor
- Servidores públicos/multiplayer reais em v1 — desenvolvimento em servidor Java local para controle e testes
- Minecraft Bedrock Edition — Mineflayer suporta apenas Java Edition
- Aprendizado contínuo / fine-tuning do modelo — fora do escopo de pesquisa do MVP

## Context

- **Idioma:** Comunicação do projeto em pt-BR.
- **Origem:** PRD detalhado já existente em `README.md` define visão, missão, arquitetura, estados cognitivos, sistemas de necessidades/objetivos/memória, sistema social e MVP em 4 fases.
- **Arquitetura-alvo:** `Minecraft Server → Mineflayer → Action Layer → LangGraph → LLM → Memory Systems`.
- **Estados cognitivos:** Idle, Exploring, Gathering, Building, Socializing, Fighting, Reflecting.
- **Sistemas planejados:** necessidades internas (sobrevivência, recursos, abrigo, curiosidade, socialização), objetivos dinâmicos (prioridade/progresso/dependências/recompensa interna), memória (curto prazo, longo prazo, semântica), perfis sociais por jogador.
- **Em aberto para a pesquisa:** estratégia de persistência da memória de longo prazo e semântica (SQLite? arquivos JSON? vector store com embeddings?).

## Current State

**Shipped: v1.0 MVP — 2026-06-19** · 4 fases + 1 backlog (999.1) · 24 planos · ~7.122 LOC TypeScript · 227 testes (1 fail é teste de config que lê `.env` local).

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
- **LLM (v1)**: LM Studio (modelo local) — custo zero e adequado a um loop sempre-ativo; reasoning local é mais fraco que frontier cloud.
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
*Last updated: 2026-06-19 after v1.0 MVP milestone (persistência, reflexão e identidade viva — shipped com Known Gaps de verificação ao vivo)*
