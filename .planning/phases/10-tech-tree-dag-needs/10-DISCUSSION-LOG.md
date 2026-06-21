# Phase 10: Tech Tree DAG + Needs - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-21
**Phase:** 10-tech-tree-dag-needs
**Areas discussed:** Estratégia de resolução do DAG, selectGoal com dependsOn, Ponte necessidade → item alvo, Ferramenta certa por tier (TECH-05)

---

## Estratégia de resolução do DAG

| Option | Description | Selected |
|--------|-------------|----------|
| Híbrido: grafo completo, executa folha | Resolve o DAG inteiro com memo+cap, mas executa só a folha executável | ✓ |
| Lazy: resolve um nível por vez | Resolve um requisito imediato por vez; simples, mas sem visibilidade do plano total | |
| Eager: DAG completo, todos os sub-goals | Cria todos os sub-goals de uma vez; mais complexo e poluído no estado | |

**User's choice:** Híbrido — grafo completo, executa folha a folha

---

| Option | Description | Selected |
|--------|-------------|----------|
| src/motivation/tech-tree.ts (módulo puro) | Módulo puro sem referência ao grafo, segue padrão do motivation/ | ✓ |
| Dentro do nó deliberation | Mais simples inicialmente, mas mistura responsabilidades | |

**User's choice:** src/motivation/tech-tree.ts (novo módulo puro)

---

| Option | Description | Selected |
|--------|-------------|----------|
| Uma vez ao criar o goal de alto nível | Snapshot no momento da criação; simples, não muda durante execução | ✓ |
| A cada tick de deliberation | Mais robusto, mais caro e volátil | |
| Lazy: ao concluir/bloquear | Middle-ground, adapta quando necessário | |

**User's choice:** Uma vez ao criar o goal de alto nível

---

| Option | Description | Selected |
|--------|-------------|----------|
| Cap de 8 níveis + memo por itemId | Suficiente para vanilla (≤5 na prática), testável | ✓ |
| Cap de 16 níveis + memo | Conservador; cobre packs de mods mas desnecessário | |

**User's choice:** Cap de 8 níveis + memo por itemId

---

## selectGoal com dependsOn

| Option | Description | Selected |
|--------|-------------|----------|
| Filtrar bloqueados dentro do selectGoal | Remove candidatos com deps não satisfeitas; extensão mínima do código | ✓ |
| TechPlanner separado | Resolver externo injeta o próximo goal; dois caminhos de seleção | |

**User's choice:** Filtrar bloqueados — selectGoal recebe Set<string> de completos e filtra

---

| Option | Description | Selected |
|--------|-------------|----------|
| progress >= 1 (campo existente) | Reutiliza contrato; sem novo campo na interface Goal | ✓ |
| completed: boolean explícito | Mais claro semanticamente, mas adiciona campo | |

**User's choice:** progress >= 1 no campo já existente

---

| Option | Description | Selected |
|--------|-------------|----------|
| Blocked → tentar coletar diretamente (gather goal) | Item sem receita vira gather goal; fecha a cadeia sem exceção | ✓ |
| Parar e deixar LLM decidir | Flexível mas dependente do LLM local | |

**User's choice:** Marcar como blocked e tentar coletar diretamente (sub-goal do tipo gather)

---

## Ponte necessidade → item alvo

| Option | Description | Selected |
|--------|-------------|----------|
| gatheringLadder determinística + inventário atual | Config já existe; sem LLM; verificável ao vivo | ✓ |
| DAG auto-proposing (avalia o que constitui progresso) | Mais inteligente, mais lógica | |
| LLM decide o item alvo | Flexível, risco de alucinação em modelos fracos | |

**User's choice:** gatheringLadder determinística — percorrer a ladder e encontrar o primeiro item insuficiente

---

| Option | Description | Selected |
|--------|-------------|----------|
| DAG acionado diretamente pela não-satisfação da need | Determinístico; LLM não precisa inferir a cadeia | ✓ |
| LLM ainda confirma o objetivo de alto nível | Mais flexível, mais latência e ponto de falha | |

**User's choice:** DAG acionado diretamente

---

| Option | Description | Selected |
|--------|-------------|----------|
| Satisfeita por delta de inventário | Reutiliza contrato grounding; sem lógica nova de satisfação | ✓ |
| Satisfeita quando goal-raiz completado (progress=1) | Agente permanece insatisfeito durante toda a cadeia | |

**User's choice:** Satisfeita por delta de inventário

---

## Ferramenta certa por tier (TECH-05)

| Option | Description | Selected |
|--------|-------------|----------|
| A melhor disponível no inventário | Simples; tabela estática wooden=1, stone=2, iron=3, diamond=4 | ✓ |
| A mínima necessária para o bloco-alvo (minecraft-data) | Mais complexo; requer lookup; preserva ferramentas boas | |

**User's choice:** A melhor disponível no inventário

---

| Option | Description | Selected |
|--------|-------------|----------|
| Verificar compatibilidade + equipar ANTES de dig (pré-flight) | Evita "cavar a seco"; retorna no_effect se sem ferramenta compatível | ✓ |
| Tentar dig e observar resultado pelo grounding | Simples mas tenta e falha antes de descobrir — looping | |

**User's choice:** Pré-flight: verificar e equipar antes de tentar

---

| Option | Description | Selected |
|--------|-------------|----------|
| src/skills/tool-selector.ts (evolui selectToolFor atual) | Ponto de extensão documentado D-17 Fase 9; zero mudança em dig.ts | ✓ |
| Dentro do tech-tree.ts | Mais coeso mas mistura preocupações | |

**User's choice:** src/skills/tool-selector.ts

---

## Claude's Discretion

- Estrutura exata de retorno do resolveDag (lista plana vs. árvore)
- IDs dos goals de tech-tree
- Onde no grafo LangGraph o DAG é reconstruído ao receber falha
- Quantidade mínima de cada item da gatheringLadder para "satisfeito"

## Deferred Ideas

- Curriculum adaptativo ao bioma (TECH-F1) — deserto/cacto, etc.
- Tech tree além de diamante (TECH-F2)
- Ferramenta mínima por bloco via minecraft-data
- Goal-raiz persistente entre sessões (candidato para Fase 14)
