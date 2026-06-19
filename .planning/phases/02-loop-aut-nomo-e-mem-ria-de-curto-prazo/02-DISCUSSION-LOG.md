# Phase 2: Loop Autônomo e Memória de Curto Prazo - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-18
**Phase:** 02-loop-aut-nomo-e-mem-ria-de-curto-prazo
**Areas discussed:** Política de estados, Anti-repetição (COG-04), Memória curto prazo (MEM-01), Cadência do loop

---

## Política de transição de estados

### Arbitragem entre estados

| Option | Description | Selected |
|--------|-------------|----------|
| Prioridade fixa | Ordem rígida Socializing > Gathering > Exploring > Idle | ✓ (derivado) |
| Pontuação (scoring) | Score por heurísticas, maior vence | |
| Idle como base ociosa | Idle padrão, sai só com gatilho claro | |

**User's choice:** Resposta livre — o usuário redirecionou: quer o agente **autônomo por padrão**, não dependente de jogador. Acrescentou um requisito de **controle por comando de chat**: pausar (fica parado), chamar/standby (vem perto e aguarda ordens), liberar (faz o que quiser). Resolvido como prioridade fixa (D-05) + máquina de modo de controle (D-08/D-09).
**Notes:** O pedido de controle por chat foi tratado como adição de escopo deliberada e confirmada (ver seção Comandos abaixo).

### Gathering — o que coletar

| Option | Description | Selected |
|--------|-------------|----------|
| Lista configurável (.env) | Prioridade de tipos de bloco em config | ✓ (como escada de sobrevivência) |
| Madeira fixa | Hardcoded em troncos | |
| Bloco minerável mais próximo | Ganancioso, qualquer tipo | |

**User's choice:** Resposta livre — "objetivo de sobreviver e ficar mais forte por viver; não quero nada fixo, tudo condicional". Resolvido como escada de prioridade de sobrevivência configurável (D-07).
**Notes:** Confirmada a divisão: escada fixa na Fase 2; necessidades que decaem + objetivos dinâmicos na Fase 3.

### Comandos de chat (decisão de escopo)

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, modos na Fase 2 | Estado de controle + parser de comando literal no chat | ✓ |
| Só a máquina de modos | Modos sem gatilho de chat (chat fica p/ Fase 3) | |
| Adiar tudo p/ Fase 3 | Fase 2 puramente autônoma | |

**User's choice:** "o que for melhor para o projeto" → Claude decidiu **incluir modos + parser literal** (D-08/D-09).
**Notes:** Racional: freio de segurança sobre o loop autônomo desde o início, 100% sem-LLM, separa parsing de comando da conversa da Fase 3.

### Escada de sobrevivência (confirmação de divisão)

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, escada fixa agora | Prioridade de sobrevivência fixa; NEED/GOAL na Fase 3 | ✓ |
| Mínimo agora | Só madeira/pedra; toda lógica na Fase 3 | |

**User's choice:** "Sim, escada fixa agora" (D-07).

---

## Anti-repetição e comprometimento (COG-04)

### Anti-oscilação

| Option | Description | Selected |
|--------|-------------|----------|
| Comprometimento + cooldown | Histerese + cooldown espacial | |
| Só detecção + log | Detecta repetição e força mudança | |
| Janela de histórico | Detecta padrão A→B→A→B e quebra | |

**User's choice:** Resposta livre — "não quero isso, deixa o LLM livre, tudo estará na memória dele". Claude esclareceu que COG-04 é critério de sucesso obrigatório da Fase 2 (sem LLM ainda) e propôs uma rede de segurança mínima.

### Reação a falha de skill

| Option | Description | Selected |
|--------|-------------|----------|
| Backoff + trocar alvo | Marca alvo falho, troca, M falhas → Idle | ✓ (Claude) |
| ReTentar com limite | Mesmo alvo até R vezes | |
| Sempre p/ Idle | Qualquer falha → Idle | |

**User's choice:** "vc quem sabe" → Claude escolheu backoff leve (D-11).

### COG-04 — resolução

| Option | Description | Selected |
|--------|-------------|----------|
| Rede de segurança mínima | Guard leve; comprometimento rico p/ Fase 3 | ✓ |
| Guard + comprometimento | Inclui histerese agora | |

**User's choice:** "Rede de segurança mínima" (D-10).

---

## Memória de curto prazo (MEM-01)

### Conteúdo do ring buffer

| Option | Description | Selected |
|--------|-------------|----------|
| Eventos ricos | Transições, ações+resultado, eventos do mundo, comandos chat | ✓ |
| Só ações | Apenas histórico de ações | |
| Ações + observações | Inclui resumo do snapshot por tick | |

**User's choice:** "Eventos ricos" (D-12).

### Dimensionamento / orçamento de tokens

| Option | Description | Selected |
|--------|-------------|----------|
| Token-budget desde já | Evicção por orçamento de tokens estimado (FIFO) | ✓ |
| Contagem + esqueleto | Evicção por contagem; estimatedTokens inativo | |

**User's choice:** "Token-budget desde já" (D-13).

---

## Cadência do loop

### Ritmo e execução de skills

| Option | Description | Selected |
|--------|-------------|----------|
| Tick fixo, espera a skill | Single-flight bloqueante, intervalo mínimo configurável | ✓ |
| Tick fixo, não-bloqueante | Tica mesmo com skill rodando | |
| Dirigido por eventos | Reavalia ao concluir skill/evento | |

**User's choice:** "Tick fixo, espera a skill" (D-02).

### Checkpointer do LangGraph

| Option | Description | Selected |
|--------|-------------|----------|
| MemorySaver (em memória) | Sem disco, reinicia do zero; persistência p/ Fase 4 | ✓ |
| Sem checkpointer | Estado em estruturas próprias | |
| bun:sqlite agora | Antecipa persistência (contra adiamento) | |

**User's choice:** "MemorySaver (em memória)" (D-03).

---

## Claude's Discretion

- Reação a falha de skill: backoff leve (D-11).
- Inclusão dos modos de controle + parser de chat: decidido por Claude a pedido do usuário ("o que for melhor").
- Intervalo de tick, palavras-chave de comando, valores de N/M/orçamento, taxonomia de eventos, logging, estrutura de diretórios.

## Deferred Ideas

- Conversa coerente (CHAT-01) → Fase 3.
- Necessidades que decaem + objetivos dinâmicos (NEED/GOAL) → Fase 3.
- Duas taxas / COG-03 → Fase 3.
- Persistência real e sobrevivência a reinício/reconexão (MEM-02/03, CONN-03) → Fase 4 / Fase 3.
