# Phase 1: Presença e Conexão (fundação sem-LLM) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-18
**Phase:** 01-presença-e-conexão-fundação-sem-llm
**Areas discussed:** Runtime primário, Servidor Minecraft local, Escopo do snapshot de percepção, Skills como funções vs. Zod tools (ACT-05)

---

## Runtime primário

| Option | Description | Selected |
|--------|-------------|----------|
| Bun desde o início | Usar Bun como runtime desde o primeiro commit. Se algo quebrar no Mineflayer, registrar e cair para Node. Resolve o bloqueio cedo e valida a stack antes de investir em código. | ✓ |
| Node runtime + Bun como package manager | Node roda o agente, Bun só para instalar pacotes e scripts. Mais seguro — Mineflayer é testado oficialmente em Node, zero surpresas com NAPI. | |
| Spike explícito primeiro | Antes de qualquer estrutura, criar um spike connect+walk+dig+reconnect rodando em Bun e em Node, comparar resultados, depois fixar o runtime. | |

**User's choice:** Bun desde o início
**Notes:** Decisão deliberada de validação — o projeto quer provar a compatibilidade Bun↔Mineflayer desde o início, não deixar como dívida técnica para depois. Implica: usar `bun:sqlite` no futuro (Fase 2+), evitar `better-sqlite3`, não instalar `prismarine-viewer`.

---

## Servidor Minecraft local

| Option | Description | Selected |
|--------|-------------|----------|
| 1.21.x (latest stable) | Versão mais recente suportada pelo Mineflayer (1.21.11). | ✓ |
| 1.20.4 (LTS de fato) | Versão estabilizada, muito testada pela comunidade Mineflayer. | |
| Você decide | Deixar para o pesquisador/planejador escolher. | |

**User's choice:** 1.21.x

---

| Option | Description | Selected |
|--------|-------------|----------|
| Modo offline + .env | Servidor em offline-mode (sem auth Mojang), credenciais em arquivo .env. | ✓ |
| Modo online + .env | Autenticação real com conta Minecraft. | |
| Config em código (hardcoded) | Valores de host/porta diretamente no código. | |

**User's choice:** Modo offline + .env

---

| Option | Description | Selected |
|--------|-------------|----------|
| Paper (Recomendado) | Fork de alto desempenho do Spigot. | |
| Vanilla oficial | Servidor padrão da Mojang. Zero plugins. | ✓ |
| Você decide | Qualquer servidor Java local compatível. | |

**User's choice:** Vanilla oficial
**Notes:** Escolha explícita — não substituir por Paper mesmo que a documentação sugira.

---

## Escopo do snapshot de percepção

| Option | Description | Selected |
|--------|-------------|----------|
| Raio fixo pequeno (~16 blocos) | Blocos imediatamente em volta do agente. | |
| Raio configurável (padrão ~32) | Parametrizado via config. Permite ajustar sem recompilar. | ✓ |
| Sem raio — só o que está visível | Usar o campo de visão nativo do Mineflayer. | |

**User's choice:** Raio configurável (padrão ~32)

---

| Option | Description | Selected |
|--------|-------------|----------|
| Tipo + posição + distância | Para cada entidade: tipo, posição e distância. | |
| Completo: tipo + posição + vida + metadata | Tudo que o Mineflayer exposes por entidade. | ✓ |
| Só jogadores próximos | Apenas lista de jogadores dentro do raio. | |

**User's choice:** Completo: tipo + posição + vida + metadata
**Notes:** Usuário prefere dados ricos no snapshot para não precisar ampliar a interface depois.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Resumo: itens + quantidades | Lista de {item, quantidade} do inventário. | |
| Completo: slot por slot + equipamentos | Cada slot numerado com item, quantidade e metadata. | ✓ |
| Você decide | Detalhe de implementação. | |

**User's choice:** Completo: slot por slot + equipamentos

---

## Skills como funções vs. Zod tools (ACT-05)

| Option | Description | Selected |
|--------|-------------|----------|
| Schemas Zod agora, mesmo sem LLM | Cada skill com (a) função TS e (b) schema Zod. | ✓ |
| Só funções agora, Zod na Fase 3 | Wrapper Zod adicionado quando o LLM entra. | |
| Zod para validação interna + prep para LLM | Igual à primeira, com ênfase em validação interna. | |

**User's choice:** Schemas Zod agora, mesmo sem LLM
**Notes:** Schemas Zod como documentação viva da API de skills + validação interna. Na Fase 3, o LangGraph usa os schemas sem refatoração.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Navigate + Dig (mínimo viável) | Navegar e minerar. | |
| Navigate + Dig + Follow + Attack (stubs) | Os dois acima mais follow/attack como stubs com timeout. | ✓ |
| Você decide | Planejador define o conjunto de skills. | |

**User's choice:** Navigate + Dig + Follow + Attack (stubs)

---

## Claude's Discretion

- Valor exato do timeout padrão por skill
- Parâmetros da distribuição gaussiana para ritmo humanizado
- Estrutura de diretórios do projeto
- Estratégia de logging de reconexão

## Deferred Ideas

Nenhuma ideia fora do escopo surgiu na discussão.
