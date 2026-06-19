# Phase 3: Cognição com LLM — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisões estão em CONTEXT.md — este log preserva as alternativas consideradas.

**Date:** 2026-06-19
**Phase:** 03-cogni-o-com-llm-loop-completo-necessidades-e-objetivos
**Areas discussed:** Personalidade & voz, Eixo de disposição (AUTONOMOUS/ASSISTANT), Necessidades & motivação, Conversa com jogadores, Objetivos & ritmo de deliberação

---

## Seleção de áreas

| Opção | Selecionado |
|-------|-------------|
| Personalidade & voz | ✓ |
| Necessidades & motivação | ✓ |
| Conversa com jogadores | ✓ |
| Objetivos & ritmo de pensar | ✓ |

---

## Personalidade & Voz (CHAT-03)

### Arquétipo
| Opção | Selecionado |
|-------|-------------|
| Explorador curioso | |
| Sobrevivente pragmático | ✓ |
| Companheiro brincalhão | |
| Neutro/prestativo | |

### Idioma
| Opção | Selecionado |
|-------|-------------|
| Português (pt-BR) | |
| Espelha quem fala | ✓ |
| Inglês | |

### Auto-percepção
| Opção | Selecionado |
|-------|-------------|
| Assume que é uma IA | |
| Roleplay de habitante | |
| Critério do Claude | ✓ |

---

## Necessidades Internas & Motivação (NEED-01/02)

### Conjunto
| Opção | Selecionado |
|-------|-------------|
| As 5 do PRD | |
| Núcleo enxuto (3): sobrevivência, recursos, curiosidade | ✓ |
| Critério do Claude | |

### Origem dos valores
| Opção | Selecionado |
|-------|-------------|
| Híbrido (real + timer) | ✓ |
| Tudo por decaimento | |
| Critério do Claude | |

### Equilíbrio
| Opção | Selecionado |
|-------|-------------|
| Sobrevivência domina | |
| Equilibrado | ✓ |
| Critério do Claude | |

---

## Conversa com Jogadores (CHAT-01/02) + comando !auto

### Quando responde
| Opção | Selecionado |
|-------|-------------|
| Só quando endereçado | |
| Todo chat próximo | ✓ |
| Critério do Claude | |

### Proatividade
| Opção | Selecionado |
|-------|-------------|
| Reativo apenas | |
| Raro, sob gatilho | |
| **Configurável no .env (reativo ou sob gatilho)** | ✓ (resposta livre) |

**User's choice:** Proatividade configurável via `.env`. Revelou a visão dos dois modos: prova de conceito para (A) analisar a sobrevivência autônoma do agente e (B) simular uma pessoa/agente que ajuda os jogadores.

### Conversar interrompe a ação
| Opção | Selecionado |
|-------|-------------|
| Não aborta a ação | |
| Jogador tem prioridade | |
| Critério do Claude | ✓ |

### Comando !auto vs !livre
| Opção | Selecionado |
|-------|-------------|
| Alias (mantém os dois) | ✓ (default — usuário reenfatizou a visão dos modos em vez de escolher) |
| Só !auto | |
| Critério do Claude | |

**Notes:** Usuário pediu explicitamente adicionar `!auto`. Tratado como alias de modo de controle autônomo, mantendo `!livre`.

---

## Eixo de Disposição — AUTONOMOUS vs ASSISTANT (aprofundamento)

### Confirmação dos dois modos via .env
| Opção | Selecionado |
|-------|-------------|
| Sim, exatamente (eixo de disposição AUTONOMOUS vs ASSISTANT) | ✓ |
| Quase — é só knobs no .env | |
| Critério do Claude | |

### Foco do modo ASSISTANT
| Opção | Selecionado |
|-------|-------------|
| Ajudar e conversar | |
| Ajuda sem largar a sobrevivência | |
| Critério do Claude | ✓ |

### Como o modo é definido/trocado
| Opção | Selecionado |
|-------|-------------|
| Só no .env (startup) | |
| .env default + troca por chat | ✓ |
| Critério do Claude | |

### ASSISTANT aceita tarefas dos jogadores?
| Opção | Selecionado |
|-------|-------------|
| Sim — pedido vira objetivo (GOAL-01) | ✓ |
| Não — só tom/conversa | |
| Critério do Claude | |

### Modo AUTONOMOUS e jogadores
| Opção | Selecionado |
|-------|-------------|
| Cordial mas independente | |
| Praticamente ignora | ✓ |
| Critério do Claude | |

---

## Objetivos Dinâmicos & Ritmo de Deliberação (GOAL-01/02 + COG-03)

### Comprometimento/histerese
| Opção | Selecionado |
|-------|-------------|
| Leve e configurável | |
| Forte | ✓ |
| Critério do Claude | |

### Interrupção do comprometimento
| Opção | Selecionado |
|-------|-------------|
| Perigo + pedido de jogador | ✓ |
| Só sobrevivência crítica | |
| Critério do Claude | |

### Gatilho da deliberação LLM
| Opção | Selecionado |
|-------|-------------|
| Por evento + teto | |
| Periódico fixo | |
| Critério do Claude | ✓ |

### Orçamento de replanejamento
| Opção | Selecionado |
|-------|-------------|
| Intervalo mínimo no .env | |
| Só single-flight | |
| Critério do Claude | ✓ |

---

## Claude's Discretion

- Auto-percepção do agente (IA vs roleplay) — via personality prompt.
- Foco do modo ASSISTANT (ajudar-vs-sobreviver), com recomendação de respeitar anti-starvation.
- Conversar interrompe ação ou não.
- Gatilho da deliberação LLM e orçamento de replanejamento (recomendação: event-driven + intervalo mínimo no .env).
- Palavras-chave exatas dos comandos de disposição (!ajudante/!sozinho) e alias !auto.
- Valores default de necessidades/objetivos/LLM; tokenizer real; técnica de structured-output (→ research).

## Deferred Ideas

- Persistência em disco / restart, memória longo prazo e semântica (Fase 4).
- Reflexão durável, perfis sociais, personalidade evolutiva (Fase 4).
- Provedores de LLM em nuvem (v2).
- Otimização collectBlock OOM (backlog 999.1).
- Necessidades abrigo/socialização com lógica real (stub nesta fase).
