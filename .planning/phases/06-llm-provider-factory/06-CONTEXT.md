# Phase 6: LLM Provider Factory - Context

**Gathered:** 2026-06-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Trocar entre provider de raciocínio **cloud (OpenAI GPT-4.1-mini)** e **local (LM Studio)** por env/config **sem tocar no loop cognitivo**, com:
- proteção de custo (teto de chamadas + degradação para o local),
- embeddings sempre locais (custo-zero) independentemente do provider de chat,
- paridade de saída estruturada (Zod) verificada nos dois caminhos.

Estende a abstração `LlmProvider` que **já existe** ([src/llm/provider.ts](../../../src/llm/provider.ts)). NÃO é componente novo de topo. Fora de escopo: roteamento por dificuldade per-call (cloud só em decisão difícil / nano em subtarefa) — fica como ideia diferida.

</domain>

<decisions>
## Implementation Decisions

### Modelo cloud + corte de custo
- **D-01:** Provider cloud = **GPT-4.1-mini** (decisão confirmada do usuário, ciente do trade-off). Razão: custo **100% previsível** — família NÃO-reasoning, sem reasoning tokens ocultos cobrados como output. Ideal para loop sempre-ativo de projeto de pesquisa.
- **D-02:** Corte de custo no caminho cloud = **`max_tokens` baixo + prompt caching** (manter system+persona+schema estáveis no início do prompt → até -90% no input cacheado). NÃO usa `reasoning.effort` (não existe na família 4.1).
- **D-03:** ⚠️ **Critério de sucesso #4 do ROADMAP precisa ser reescrito.** Hoje cita "`reasoning.effort` baixo como default cloud" — tecnicamente impossível com GPT-4.1-mini. Substituir por: "teto de chamadas/sessão + gate de invocação + `max_tokens` baixo + prompt caching". O título do roadmap (GPT-4.1-mini) e a decisão batem; só a frase do critério #4 está inconsistente.
- **D-04:** A factory deve aplicar `reasoning.effort` **condicionalmente** — somente se o modelo configurado for da família `gpt-5.x`/o-series (preparação para troca futura de modelo). Enviar `reasoning.effort` ao 4.1-mini é erro; o código deve omiti-lo para essa família.
- **D-05:** Default geral continua **LM Studio local** (custo-zero); cloud é **opt-in** por env (`LLM_PROVIDER=openai`, default `local`).

### Teto de custo (PROV-05) — Pacote A
- **D-06:** Implementar como **decorator `withSpendCap(cloudProvider, localProvider, cfg)`** que envolve a interface `LlmProvider`. NÃO toca `decideAction` nem o loop cognitivo.
- **D-07:** **Unidade do teto = chamadas por janela** (hard-cap — bloqueia ANTES da chamada cara, mata diretamente "fatura escala com bot parado"). Tokens via `usage_metadata` da resposta LangChain contados **apenas como métrica de log** para calibrar o teto depois.
- **D-08:** **Ação ao estourar = fallback-to-local** (cai para LM Studio custo-zero, reusando o caminho de degradação D-17 já existente: `available()=false → arbiter`). O bot fica "burro mas vivo" — coerente com o Core Value (loop nunca para). **Descartado:** pausar o loop (viola o invariante always-on).
- **D-09:** **Persistência do contador = SQLite** (reusa `dbPath` da Fase 4). Necessário porque uma "sessão" always-on dura dias e o teto só faz sentido se sobrevive a restart; fecha a brecha de crash-loop que um contador in-memory deixaria. Janela diária/mensal.
- **D-10:** Parâmetros novos em [src/config.ts](../../../src/config.ts) com validação de range no boot (padrão tipado já estabelecido): ex. `LLM_PROVIDER`, `LLM_CLOUD_MAX_CALLS_PER_WINDOW`, `LLM_CLOUD_WINDOW_MS`, `LLM_CLOUD_CAP_ACTION`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_MAX_TOKENS`.

### Embeddings local com chat cloud (PROV-03) — Opção C
- **D-11:** **Composição explícita na factory.** `createOpenAiProvider()` compõe um `createLocalEmbedder()` e **delega `embed()` a ele** — embeddings sempre no LM Studio, mesmo com `LLM_PROVIDER=openai`. Composição nomeada/visível no ponto de construção.
- **D-12:** Interface `LlmProvider` e todos os consumidores de `embed()` (deliberation, reflexão) ficam **intactos**; mocks de teste existentes (`offProvider`, `slowProvider`) intactos. ~1-2 arquivos. **Descartado:** Opção A (embed hardcoded escondido — anti-pedagógico); Opção B/ISP (refatora injeção+mocks, ~5-7 arquivos — diferida para se o estudo de ISP/DI virar objetivo).
- **D-13:** Introduzir uma factory de seleção `createProvider()` (lê `LLM_PROVIDER`) chamada 1x por sessão em [src/cognition/loop.ts:31](../../../src/cognition/loop.ts#L31), substituindo a chamada direta a `createLmStudioProvider()`.

### Teste de paridade (PROV-04) — Híbrido C+D
- **D-14:** **CI determinístico/custo-zero:** mocks (suíte existente em [src/llm/structured.test.ts](../../../src/llm/structured.test.ts)) + teste **schema-only** que afirma que o JSON Schema derivado de `ActionDecisionSchema` tem `type:"object"` — detecta a regressão do caveat zod v4 (langchainjs #8357, sintoma `type:"None"`) sem rede.
- **D-15:** **Paridade real sob demanda:** UM teste live gated por `RUN_LIVE_PARITY=1` (via `test.skipIf` do bun) que percorre os dois providers reais pela mesma interface `LlmProvider.decide` e faz `ActionDecisionSchema.parse()` em cada saída. CI nunca o aciona; o dev roda antes de release.
- **D-16:** **Blindar `provider.decide`** com fallback: no catch de `withStructuredOutput`, passar `z.toJSONSchema(schema)` (nativo do zod v4, preferível ao `zod-to-json-schema` de terceiros) como JSON Schema cru. Caminho testável SEM rede (mock cujo `withStructuredOutput` lança `type:"None"` na 1ª chamada).
- **D-17:** Validate→repair→fallback continua **obrigatório nos DOIS providers** (não relaxar porque "GPT é confiável" — provider é trocável por env, código precisa sobreviver ao pior caso/local fraco).

### Claude's Discretion
- Nomes exatos das env vars e seus defaults/ranges.
- Estrutura exata da tabela SQLite do contador de gasto (ex. `llm_spend(window_key, count, tokens)`).
- Tamanho da janela default e do teto default de chamadas.
- Formato dos fixtures de paridade (se adicionar a camada VCR/cassette opcional).
- Onde exatamente extrair `createLocalEmbedder` (módulo próprio vs dentro de provider.ts).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisitos da fase
- `.planning/REQUIREMENTS.md` — PROV-01 a PROV-05 (escopo comprometido do provider)
- `.planning/ROADMAP.md` §"Phase 6: LLM Provider Factory" — goal + critérios de sucesso (NOTA: critério #4 a reescrever, ver D-03)

### Código existente a estender (NÃO recriar)
- `src/llm/provider.ts` — interface `LlmProvider` (decide/chat/available/embed); `createLmStudioProvider()`; `embed()` via fetch direto a `/v1/embeddings` (linhas 92-106); `withStructuredOutput(schema, { method: 'jsonSchema' })` (linha 62 — ponto de injeção do fallback D-16)
- `src/llm/structured.ts` — `decideAction` validate→repair→fallback (nunca lança; usa fallback determinístico/arbiter). NÃO precisa mudar
- `src/llm/structured.test.ts` — suíte mock existente onde entram o teste schema-only (D-14) e o gate `RUN_LIVE_PARITY` (D-15)
- `src/llm/schemas.ts` — `ActionDecisionSchema` (import bare `import { z } from 'zod'` — caminho seguro do caveat #8357)
- `src/config.ts` — onde adicionar os envs novos + validação de range no boot (seção Fase 3 LLM, linhas ~61-107 / ~189-209)
- `src/cognition/loop.ts` §L31 — criação 1x/sessão do provider (ponto do futuro `createProvider()`)
- `src/cognition/deliberation.ts` §L190 — consumidor de `provider.embed()`

### Pesquisa v2.0 (decisões e armadilhas)
- `.planning/research/STACK.md` §"Provider LLM configurável" + §"Cuidados de CUSTO num loop sempre-ativo" — ChatOpenAI mesmo p/ local e cloud; modelos/preços; caveat zod v4 ↔ withStructuredOutput
- `.planning/research/PITFALLS.md` §"Pitfall 6: Custo descontrolado" + §"Pitfall 7: Divergência de structured-output" — gate de custo e paridade são critério de aceite da abstração
- `.planning/research/ARCHITECTURE.md` §"Pattern 5" (linhas ~266-295) — já recomenda "embeddings sempre locais... desacoplar os dois"

### Externo (validar ao vivo)
- langchainjs issue #8357 — caveat zod v4 ↔ `withStructuredOutput` (sintoma `type:"None"`); resolvido em `@langchain/core@0.3.58+`/`@langchain/openai@0.5.13+`. Stack atual (`@langchain/core@^1.2.0`, `@langchain/openai@1.5.1`) é pós-correção
- OpenAI API docs (jun/2026) — GPT-4.1-mini: Structured Outputs/strict JSON Schema sim; `reasoning.effort` NÃO (família não-reasoning); prompt caching -90% input

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `LlmProvider` (interface) + `createLmStudioProvider()` — a abstração-alvo; `ChatOpenAI` já encapsulado (só muda baseURL/apiKey/model entre local e cloud)
- `decideAction` (validate→repair→fallback) — reusável idêntico nos dois providers; nunca lança
- `available()` — gancho de degradação graciosa (D-17) que o `withSpendCap` reusa para o fallback-to-local
- `embed()` via fetch direto — padrão correto (NÃO usar `OpenAIEmbeddings`, que trava com LM Studio); reusado pelo `createLocalEmbedder`
- SQLite da Fase 4 (`dbPath`) — store reusável para o contador de gasto persistente
- `config.ts` — padrão de env tipado + validação de range no boot

### Established Patterns
- Provider criado 1x por sessão e injetado no grafo por closure (`buildGraph({ bot, holder, provider })`)
- Single-flight lock + gate de invocação (`replanMinIntervalMs`) — protegem concorrência/latência; o teto cobre a lacuna de FREQUÊNCIA/custo
- Degradação graciosa D-17: provider off → fallback determinístico sem custo

### Integration Points
- `src/cognition/loop.ts:31` — trocar `createLmStudioProvider()` por `createProvider()` (seleção por env)
- `src/config.ts` — novos envs do provider/teto
- `src/llm/provider.ts` — `createOpenAiProvider()` + `withSpendCap()` + `createLocalEmbedder()`

</code_context>

<specifics>
## Specific Ideas

- Usuário priorizou **custo previsível** sobre raciocínio mais forte ao confirmar GPT-4.1-mini ciente de que perde o `reasoning.effort`.
- Perfil conservador em vendor choices: preferir o que já está no projeto (mesma classe `ChatOpenAI`, zero dependência nova).
- Design instrutivo (projeto de pesquisa): composição explícita > diff mínimo escondido (motivou Opção C nos embeddings).

</specifics>

<deferred>
## Deferred Ideas

- **Roteamento por dificuldade per-call** (local/nano na rotina, modelo forte só em decisão difícil da tech-tree) — capacidade nova; fora do escopo da Fase 6 (que é só env-switch + teto). Candidato a fase/backlog futuro.
- **Migrar para gpt-5.4-mini com `reasoning.effort`** — considerado e recusado nesta fase (usuário priorizou custo previsível); a factory já fica preparada (D-04) para a troca se um dia a qualidade de raciocínio for necessária.
- **Segregação de interfaces (ISP): `ChatProvider` + `EmbeddingProvider`** — recusado agora (refactor de injeção+mocks); reabrir se o estudo de ISP/DI virar objetivo explícito.
- **Camada VCR/cassette de fixtures de paridade** — opcional; C+D já satisfaz o roadmap.

</deferred>

---

*Phase: 06-llm-provider-factory*
*Context gathered: 2026-06-19*
