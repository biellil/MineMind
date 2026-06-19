# Phase 6: LLM Provider Factory - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-19
**Phase:** 06-llm-provider-factory
**Areas discussed:** Modelo cloud + corte de custo, Teto de custo (PROV-05), Embeddings local c/ chat cloud (PROV-03), Teste de paridade (PROV-04)
**Mode:** Advisor (calibration tier: full_maturity — vendor philosophy conservadora)

---

## Conflito sinalizado no início

ROADMAP.md (título + critério #1) e PROJECT.md dizem **GPT-4.1-mini**; pesquisa v2.0 recomenda **gpt-5.4 + reasoning.effort:low**. O critério de sucesso #4 cita "`reasoning.effort` baixo como default cloud" — **impossível com GPT-4.1-mini** (família não-reasoning, sem o parâmetro). Apresentado ao usuário para decisão (diretiva: flagar conflito, não escolher em silêncio).

---

## Modelo cloud + corte de custo

| Opção | Custo (in/out 1M) | reasoning.effort? | Selected |
|-------|-------------------|-------------------|----------|
| gpt-5.4-mini + effort:minimal | $0.40/$1.60 | ✅ | |
| **GPT-4.1-mini (manter)** | $0.40/$1.60 | ❌ | ✓ |
| gpt-5.4-nano | ~$0.20/$1.25 | ✅ | |
| gpt-4.1-nano | $0.10/$0.40 | ❌ | |

**User's choice:** Manter GPT-4.1-mini (confirmado após pergunta de esclarecimento sobre o que é `reasoning.effort`).
**Notes:** Usuário perguntou "o que é reasoning.effort?" no meio da decisão. Explicado: parâmetro de modelos de reasoning (5.x/o-series) que controla a cadeia de raciocínio invisível cobrada como output; não existe no 4.1-mini. Após entender o trade-off (custo previsível sem reasoning tokens vs raciocínio mais fraco), o usuário **confirmou** GPT-4.1-mini. Consequência registrada: corte de custo via `max_tokens` + prompt caching; critério #4 do roadmap a reescrever; factory aplica `reasoning.effort` condicionalmente só p/ 5.x/o-series (preparação p/ troca futura).

## Teto de custo (PROV-05)

| Pacote | Unidade | Ao estourar | Persistência | Selected |
|--------|---------|-------------|--------------|----------|
| **A** | chamadas/janela (hard-cap) | fallback-to-local | SQLite | ✓ |
| C | chamadas/janela | kill-switch | in-memory | |
| B | tokens/janela | fallback-to-local | SQLite | |
| D | custo $ | fallback-to-local | SQLite | |

**User's choice:** Pacote A.
**Notes:** Implementação via decorator `withSpendCap`. Pausar o loop foi descartado por violar o Core Value always-on.

## Embeddings local com chat cloud (PROV-03)

| Opção | Descrição | Selected |
|-------|-----------|----------|
| **C** | Composição explícita na factory (delega embed a createLocalEmbedder) | ✓ |
| B | Segregar interfaces (ISP): ChatProvider + EmbeddingProvider | |
| A | Provider único, embed hardcoded local (escondido) | |

**User's choice:** Opção C.
**Notes:** Melhor relação clareza/custo p/ projeto de pesquisa; interface e mocks intactos. B diferido (refactor de injeção); A recusado (anti-pedagógico).

## Teste de paridade (PROV-04)

| Opção | Descrição | Selected |
|-------|-----------|----------|
| **C+D** | Híbrido: mocks+schema-only no CI + live gated por RUN_LIVE_PARITY | ✓ |
| B | Só mocks/fixtures gravados | |
| A | Só live nos dois servidores reais | |

**User's choice:** C+D híbrido.
**Notes:** CI determinístico/custo-zero + paridade real sob demanda. Inclui teste schema-only p/ o caveat zod v4 (#8357) e fallback `z.toJSONSchema` blindando `provider.decide`.

## Claude's Discretion

- Nomes/defaults/ranges exatos das env vars
- Schema exato da tabela SQLite do contador de gasto
- Janela e teto default de chamadas
- Formato de fixtures de paridade (se adicionar VCR opcional)
- Localização de `createLocalEmbedder`

## Deferred Ideas

- Roteamento por dificuldade per-call
- Migração futura para gpt-5.4-mini (factory já preparada via D-04)
- Segregação de interfaces ISP (ChatProvider/EmbeddingProvider)
- Camada VCR/cassette de fixtures de paridade
