# Phase 12: Building Deliberado - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-22
**Phase:** 12-building-deliberado
**Areas discussed:** Abrigo funcional, Blueprint (especificação de estruturas), Ativação do estado building, Sequenciamento/pacing/robustez do place em série

---

## Seleção de áreas

| Área | Selecionada |
|------|-------------|
| Abrigo funcional (geometria + validação) | ✓ |
| Como estruturas são especificadas (blueprint) | ✓ |
| Ativação do estado building (need→goal→state) | ✓ |
| Sequenciamento, pacing e robustez do place em série | ✓ |

---

## Área B — Especificação de estruturas

| Option | Description | Selected |
|--------|-------------|----------|
| Blueprint declarativo + skill `build` paramétrica | Geradores determinísticos produzem lista {pos, bloco}; builder genérico varre (RECOMENDADO) | |
| Funções imperativas por estrutura | buildWall/buildTower/buildShelter cada uma com sua lógica | |
| LLM monta a lista de blocos crua | LLM passa coords/blocos diretamente | ✓ |

**User's choice:** LLM monta a lista de blocos crua
**Notes:** Gerou tensão com A/C/D (que apontam para geração determinística) — reconciliado depois via híbrido.

---

## Área A — Abrigo funcional (geometria + validação)

| Option | Description | Selected |
|--------|-------------|----------|
| Caixa mínima selada ao redor do bot (1×1×2) | 4 paredes + teto, validação trivial por blockAt (RECOMENDADO) | |
| Cubo 3×3 com interior | Piso/paredes/teto + espaço habitável | |
| Vedação total da mecânica do reflexo | Estende cavar-e-tampar/pilar da Fase 8 p/ fechar todos os lados | ✓ |

**User's choice:** Vedação total da mecânica do reflexo
**Notes:** Reaproveita a mecânica da Fase 8; abrigo deliberado é determinístico (não lista do LLM).

---

## Área C — Ativação / roteamento do estado building

| Option | Description | Selected |
|--------|-------------|----------|
| Need-driven + player-request, via goal `build:*` separado | Roteador determinístico espelha o DAG da Fase 10; mantém agregador de verbos intacto (RECOMENDADO) | ✓ |
| Só sob pedido do jogador (assistente) | Building não autônomo | |
| Sobrecarregar o estado `building` atual | Enfiar construção no dispatch de verbos da Fase 9 | |

**User's choice:** Need-driven + player-request, via goal `build:*` separado
**Notes:** Cumpre SC2 (estrutura autônoma); Fase 9 G-01 e reflexo Fase 8 intactos.

---

## Área D — Sequenciamento / pacing / robustez do place em série

| Option | Description | Selected |
|--------|-------------|----------|
| Loop na skill: gaussianDelay + abort-check entre blocos; placeRetries ligado; retomada idempotente | Preemptável sem 1-por-tick; liga D-04 da Fase 9; re-roda pula isFilled (RECOMENDADO) | ✓ |
| 1 bloco por tick (re-percebe cada bloco) | Máxima preempção, mas lento | |
| Rajada sem delay | Rápido mas flagável/não-preemptável | |

**User's choice:** Loop na skill com gaussianDelay + abort-check + placeRetries + retomada idempotente
**Notes:** Espelha o smelt re-roda-entre-itens (Fase 9 D-06).

---

## Reconciliação A/B (conflito sinalizado)

Tensão: A/C/D apontam para geração determinística; B coloca o LLM montando a lista crua.

### Quem monta a lista de blocos?

| Option | Description | Selected |
|--------|-------------|----------|
| Híbrido: abrigo+conhecidas determinísticas; LLM crua só p/ ad-hoc | Síntese de A+B; caminho de sobrevivência determinístico (RECOMENDADO) | ✓ |
| LLM monta crua p/ TUDO (com rede de segurança) | Inclusive abrigo; risco ao SC1 | |
| Determinístico p/ tudo (LLM só tipo+dims) | Reverte B | |

**User's choice:** Híbrido — abrigo + estruturas conhecidas determinísticas; LLM monta lista crua só para ad-hoc

### Rede de segurança do builder

| Option | Description | Selected |
|--------|-------------|----------|
| Validar cada alvo (getRefAndFace/isFilled), pular inválidos, degradar p/ partial | Reusa grounding Fase 9; nunca soterra/lança (RECOMENDADO) | ✓ |
| Coords RELATIVAS à origem + mesma validação | Offsets relativos, mais fácil p/ modelo local | |

**User's choice:** Validar cada alvo, pular inválidos, degradar p/ partial — nunca soterra/lança
**Notes:** Coords relativas ficaram como Deferred (refinamento futuro se o local errar muito).

---

## Claude's Discretion

- Nomes de arquivos/helpers, schema Zod do `build`, valores de placeRetries e do delay entre blocos.
- Algoritmo de ordenação de colocação e seleção de material do inventário.
- Dimensões default de parede/torre e gatilho fino do need de abrigo.
- Mecânica de retomada do build parcial.

## Deferred Ideas

- Coords relativas à origem p/ listas ad-hoc do LLM; iluminação/tochas; portas/janelas; construções multi-cômodo; tarefa-de-build persistente entre reinícios; aprendizado sobre falhas de build (Fase 14).
