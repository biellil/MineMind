# Phase 4: Persistência, Reflexão e Identidade Viva - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisões estão em 04-CONTEXT.md — este log preserva as alternativas consideradas.

**Date:** 2026-06-19
**Phase:** 04-persist-ncia-reflex-o-e-identidade-viva
**Mode:** advisor (USER-PROFILE.md presente; vendor_philosophy = conservative → tier full_maturity)
**Areas discussed:** Estratégia de persistência, Escopo & recuperação da memória, Reflexão (gatilho e produto), Perfis sociais & personalidade evolutiva

---

## Área 1 — Estratégia de Persistência (MEM-02)

| Option | Description | Selected |
|--------|-------------|----------|
| bun:sqlite + sqlite-vec | Store único transacional; relacional + vetorial; ACID; SQL à mão; extensão nativa pré-1.0 | ✓ |
| bun:sqlite + vectra | Relacional no SQLite + vetorial JS puro; sem atomicidade cruzada; vectra não escala | |
| vectra puro | 1 componente JS puro; não relacional; corrupção em flush | |
| JSON simples | Trivial; não cobre MEM-03 (sem vetorial) | |

**User's choice:** bun:sqlite + sqlite-vec (Recomendado)
**Notes:** Defaults aceitos — gravação write-through transacional + flush no shutdown/reflexão (WAL); ausente → schema novo; corrompido → recupera o legível, nunca aborta. Plataforma-alvo Windows (caveat macOS não aplica).

---

## Área 2 — Escopo & Recuperação da Memória (MEM-02/03)

| Option (atribuição de importância) | Description | Selected |
|--------|-------------|----------|
| Heurística determinística | Regras por tipo de evento; LLM fora do caminho quente; auditável | ✓ |
| Híbrido (heurística + refino LLM em lote no Reflecting) | Base barata + refino amortizado; alvo de evolução | |
| LLM por evento (fiel ao paper) | Nota 1-10 pelo LLM; proibitivo no modelo local | |

**User's choice:** Heurística determinística (Recomendado)
**Notes:** Defaults aceitos — taxonomia híbrida (events append-only embeddado + tabelas players/places), scoring soma-ponderada-normalizada α=1 (Generative Agents), recuperação gatilhada por contexto + Reflecting como piso.

---

## Área 3 — Reflexão: Gatilho e Produto (REFL-01)

| Option (gatilho) | Description | Selected |
|--------|-------------|----------|
| Híbrido: event-driven + importância + piso | Primário idle/objetivo fechado + secundário acúmulo de importância + piso temporal | ✓ |
| Só event-driven | idle/objetivo fechado + teto temporal; sem acúmulo de importância | |
| Acúmulo de importância (Stanford puro) | Limiar de importância acumulada; precisa tuning | |

**User's choice:** Híbrido: event-driven + importância + piso (Recomendado)
**Notes:** Defaults aceitos — `reflecting` adicionado ao enum/PRIORITY_ORDER com prioridade baixa, sempre preemptível; reusa a deliberação single-flight da Fase 3 (não é nó novo no grafo); produto faseado (consolidar CP→LP → atualizar objetivos → adiar personalidade).

---

## Área 4 — Perfis Sociais & Personalidade Evolutiva (SOC-01/02)

| Option (mecanismo de personalidade) | Description | Selected |
|--------|-------------|----------|
| A. Estado estruturado mutável | Campos por contadores determinísticos injetados no prompt; fronteira ML estrutural | ✓ |
| C. Híbrido (estado + verbalização LLM) | Contadores governam; LLM só verbaliza, não grava | |
| D. Manter stub (adiar SOC-02) | Baseline estática + tags efêmeras; não persiste evolução | |

**User's choice:** A. Estado estruturado mutável (Recomendado)
**Notes:** Defaults aceitos — trust = escalar determinístico por eventos Mineflayer (LLM interpreta, não calcula); influência via gate + cor de prompt; perfil persistido na tabela players.

---

## Follow-up — Escopo do Restart

| Option | Description | Selected |
|--------|-------------|----------|
| Só memória LP + perfis + personalidade | Needs/goals recomputados no boot; schema enxuto | |
| Tudo, incl. needs/goals/currentGoal vivos | Holder inteiro durável; agente retoma onde parou | ✓ |

**User's choice:** Tudo, incluindo needs/goals/currentGoal vivos
**Notes:** Mitigação de estado estálido (Claude's discretion): aplicar decaimento por timestamp no boot — needs continuam de lastSatisfiedAt; goals com committedAt re-avaliados para frescor.

## Claude's Discretion

- Ativação da necessidade `social` (D-18); mitigação de estado estálido no restart; modelo de embedding (default nomic-embed-text) → research; schema SQL/migrations/PRAGMAs; limiares de importância/reflexão/trust e parâmetros de scoring.

## Deferred Ideas

- Refino de importância por LLM em lote; pesos de scoring ajustáveis + pré-filtro por metadados; recuperação em camadas / em toda deliberação; verbalização da personalidade por LLM; knowledge graph social; ADV-01/02/03 e PROV-01 (v2).
