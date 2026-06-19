# Phase 4: Persistência, Reflexão e Identidade Viva - Context

**Gathered:** 2026-06-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Com os limites da memória de curto prazo já sentidos na prática (Fase 2/3), a Fase 4 resolve **com evidência** a pergunta aberta de persistência e entrega a "identidade viva" do agente:

1. **Memória de longo prazo persiste e sobrevive a um RESTART COMPLETO do processo** (não só a reconexão — isso a Fase 3 já fez em-processo via D-20). Jogadores, locais e eventos vivem em disco. (MEM-02)
2. **Recuperação semântica** de memórias relevantes por similaridade, combinando recência × relevância × importância. (MEM-03)
3. **Estado Reflecting** que revisa acontecimentos, consolida memória (curto→longo prazo) e atualiza objetivos. (REFL-01)
4. **Perfis por jogador** (nome, frequência de interação, histórico, grau de confiança). (SOC-01)
5. **Personalidade que evolui a partir de uma linha de base estática**, sem aprendizado adaptativo avançado. (SOC-02)

Requisitos cobertos: **MEM-02, MEM-03, REFL-01, SOC-01, SOC-02.**

**Fora do escopo desta fase (deferido):**
- Personalidade adaptativa avançada / aprendizado contínuo / síntese de crenças de longo prazo (v2 — ADV-01/03). A "evolução" aqui é estado estruturado reinjetado sobre uma baseline imutável, **não ML**.
- Aquisição de skills estilo Voyager (v2 — ADV-02).
- Provedores de LLM em nuvem (v2 — PROV-01); apenas a abstração de provedor da Fase 3 é reutilizada.
- Refino de importância por LLM, knowledge graph de relações sociais, recuperação em toda deliberação, verbalização da personalidade por LLM — registrados como **alvos de evolução futura**, não MVP da fase.

</domain>

<decisions>
## Implementation Decisions

### Estratégia de Persistência (MEM-02)

- **D-01:** **`bun:sqlite` + `sqlite-vec` como store único transacional.** Uma só base cobre o lado **relacional** (perfis de jogadores, eventos, locais via tabelas) **e** o lado **vetorial** (KNN semântico para MEM-03 via `vec0`). Built-in no Bun (3-6× mais rápido que better-sqlite3, que **não roda no Bun**), ACID = write-through atômico, e SQLite é o store embedded mais battle-tested — alinhado ao perfil conservador. Carrega via `import * as sqliteVec from 'sqlite-vec'; sqliteVec.load(db)`. **Custos aceitos:** escrever o schema/SQL à mão (o `SqliteSaver` do LangGraph depende de better-sqlite3 e está fora); `sqlite-vec` é extensão nativa pré-1.0 (v0.1.x) com distribuição por plataforma. **Plataforma-alvo: Windows** (o caveat de macOS `setCustomSQLite` não se aplica). Fallback documentado se a extensão nativa der trabalho: `bun:sqlite` (relacional) + `vectra` (vetorial JS puro), ao custo de perder atomicidade cruzada.
- **D-02:** **Política de gravação: write-through transacional** nas mutações de memória episódica/perfil + **flush garantido no shutdown gracioso e no fim de cada ciclo de reflexão.** `PRAGMA journal_mode=WAL` para durabilidade sob crash. **Evitar** snapshot puramente periódico (reintroduz a janela de perda que a fase quer eliminar).
- **D-03:** **Arquivo ausente → inicializa schema do zero** (cold start limpo). **Corrompido → recuperação graceful:** recupera o que for legível (SQLite isola corrupção por página/tabela melhor que um JSON monolítico), loga a perda do resto, **nunca aborta** — coerente com o Core Value (o loop cognitivo precisa sempre voltar a rodar).
- **D-04:** **Escopo do restart: TUDO persiste, incluindo o estado vivo de motivação** (valores de `needs`, `goals` comprometidos, `currentGoal`), além de memória de longo prazo, perfis sociais e estado de personalidade. O **`CognitiveStateHolder` inteiro torna-se durável em disco** — estende o D-20 da Fase 3 de *em-processo* para *disco*. O agente retoma onde parou após um restart completo. **Mitigação de estado estálido: ver discrição D-19** (decaimento por timestamp no boot).

### Escopo & Recuperação da Memória (MEM-02/03)

- **D-05:** **Taxonomia híbrida.** Stream de **`events` append-only (embeddado)** + tabelas relacionais **`players`/`places` (estado mutável, upsert)**. Espelha o `MemEvent` já tipado do curto prazo (`state_transition | action | world | chat_command`) e modela corretamente perfis sociais evolutivos e landmarks (consultáveis por chave sem LLM). Evita tanto a tabela única polimórfica (modela mal entidades mutáveis) quanto o knowledge graph (caro, exige extração LLM).
- **D-06:** **Importância 100% heurística determinística no MVP.** Regras por tipo de evento (ex.: dano sofrido = alto; primeiro contato com jogador = alto; conquista = alto; tick mundano = baixo). **Mantém o LLM local fora do caminho quente de escrita** — pontuar cada evento via LLM é o gargalo clássico num loop sempre-ativo com modelo fraco. O modelo de evento já tipado dá sinal forte de graça. *Refino de importância por LLM em lote no Reflecting = alvo de evolução futura (não MVP).*
- **D-07:** **Scoring de recuperação = soma ponderada normalizada α=1 (baseline Generative Agents, Park et al. 2023):** normalizar min-max os três fatores para [0,1] e somar com pesos iguais. Recência = decaimento exponencial; importância = nota heurística (D-06); relevância = similaridade de embedding. É **literal** o que MEM-03 pede. *Pesos ajustáveis e pré-filtro por metadados (viável só com `sqlite-vec`, não com `vectra`) = evolução posterior.*
- **D-08:** **Recuperação gatilhada por contexto** como default — ao encontrar um jogador → puxa perfil + eventos dele; ao chegar a um landmark → puxa memórias do lugar — **+ o estado Reflecting como piso garantido.** **Não** recuperar a cada deliberação LLM (custo de embedding por tick + inflação do orçamento de tokens já gerido por js-tiktoken).
- **D-09:** **Embeddings via LM Studio** (`/v1/embeddings`, `OpenAIEmbeddings` apontado para o endpoint OpenAI-compat). **Atenção ao caveat conhecido de `baseURL`** do `OpenAIEmbeddings` — setar via constructor e verificar, ou usar a env var `OPENAI_BASE_URL`. Modelo de embedding específico → discrição/research (ver D-19).

### Reflexão: Gatilho e Produto (REFL-01)

- **D-10:** **Gatilho híbrido.** Primário **event-driven** (entrada em `idle` + objetivo concluído/falho); secundário **acúmulo de importância** (reusa a heurística de D-06, estilo Stanford — reflete quando a soma de importância dos eventos recentes cruza um limiar); **piso temporal anti-starvation** (teto de tempo desde a última reflexão) para o caso de carga contínua. Importância heurística (não-LLM) evita pagar uma inferência por evento.
- **D-11:** **`reflecting` é ADICIONADO ao enum `CognitiveState`** (hoje `idle|exploring|gathering|socializing|fighting|building`). Entra no `PRIORITY_ORDER` com **prioridade baixa** (próximo de `idle`, abaixo de `socializing/gathering/exploring`) e é **sempre preemptível** por sobrevivência crítica ou pedido de jogador — coerente com a histerese/preempção de objetivos (D-15 Fase 3). Reflexão é trabalho de "tempo livre", nunca bloqueia sobrevivência.
- **D-12:** **Encaixe single-flight: a reflexão NÃO é um nó novo no `StateGraph` reativo** — é a **mesma deliberação LLM single-flight fora do grafo já construída na Fase 3 (D-19).** O gatilho apenas enfileira a intenção "refletir"; o lock single-flight garante que nunca sobreponha outra inferência; o fallback gracioso (arbiter de regra fixa) cobre reflexão ocupada/falha.
- **D-13:** **Produto faseado.** **Sempre** fazer a base — **consolidação de memória CP→LP** (sumarizar/promover eventos recentes a episódica/semântica). **Em seguida** — **atualizar/reordenar objetivos** (a fase explicita "atualiza seus objetivos"; saída restrita por Zod + fallback no-op dado o drift do modelo local). **Adiar** a alimentação da evolução de personalidade (D-14) até consolidação + objetivos estarem estáveis (uma reflexão = um produto bem-definido).

### Perfis Sociais & Personalidade Evolutiva (SOC-01/02)

- **D-14:** **Personalidade evolutiva = estado estruturado mutável (Opção A).** Um pequeno bloco de campos (ex.: humor, energia social) atualizado por **contadores determinísticos** derivados de memória/eventos e **reinjetado no prompt sobre a baseline imutável** de D-01 (Fase 3, "sobrevivente pragmático"). **A fronteira vs ADV-01 (v2) é ESTRUTURAL, não conceitual:** nenhum parâmetro de modelo é treinado, nenhuma regra é aprendida — a personalidade muda só porque um estado derivado é reinjetado. *A verbalização do estado por LLM (Opção C) é evolução instrutiva futura; o LLM nunca grava o estado.*
- **D-15:** **Confiança (`trust`) por jogador = escalar determinístico** atualizado por eventos verificáveis do Mineflayer (`+ajudou/deu item`, `−atacou/roubou`, frequência de interação). O **LLM interpreta** o número (ex.: "baixa confiança → cauteloso"), **não o calcula** — julgamento puro de LLM local é instável e não-auditável.
- **D-16:** **Perfil por jogador (SOC-01) = dados estruturados persistidos** na tabela `players` (D-05): nome, frequência de interação, histórico, `trust`.
- **D-17:** **Influência no comportamento = gate determinístico + cor de prompt** (não lógica difusa). Ex.: no modo ASSISTANT, pedido-vira-objetivo só acima de um limiar de `trust`; saudar conhecidos (frequência > 0); cautela com quem atacou (`trust` negativo → prompt "mantenha distância"). Casa com o eixo de disposição AUTONOMOUS/ASSISTANT (D-04/D-06 Fase 3).

### Claude's Discretion

- **D-18:** **Ativação da necessidade `social`** (stub em D-08 Fase 3): com o substrato de perfil + estado de personalidade agora existindo, pode ganhar lógica de decaimento mínima. Recomendação: **ativar de forma mínima** se a personalidade estruturada (D-14) der substrato; caso contrário manter stub.
- **D-19:** **Itens deixados à discrição do Claude / encaminhados a research:**
  - **Mitigação de estado estálido no restart (D-04):** aplicar decaimento por timestamp no boot — `needs` continuam a partir de `lastSatisfiedAt`; `goals` com `committedAt` são re-avaliados quanto a frescor (descartar objetivo velho demais em vez de retomar cego).
  - **Modelo de embedding específico no LM Studio** (default sugerido `nomic-embed-text`) e a técnica de geração → `/gsd:research-phase`.
  - **Schema SQL exato, migrations, PRAGMAs** além de WAL; estrutura das tabelas `events`/`players`/`places` e do índice `vec0`.
  - **Limiares e constantes:** pesos de importância por tipo de evento, limiar de acúmulo da reflexão, teto temporal do piso anti-starvation, limiar de `trust` para gates, campos exatos do estado de personalidade, taxa de decaimento de recência e parâmetros da normalização min-max.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

> O projeto **não possui specs/ADRs externos** (o antigo PRD em `README.md` foi condensado a um título). Os "canonical refs" são os artefatos de planejamento, o contexto das fases anteriores, a stack em `CLAUDE.md` e as fontes de pesquisa abaixo.

### Project Specs
- `.planning/ROADMAP.md` — Fase 4: goal, 4 critérios de sucesso e mapeamento (MEM-02/03, REFL-01, SOC-01/02). Filosofia "cada guarda precede o que ela protege".
- `.planning/REQUIREMENTS.md` — Definições completas de MEM-02/03, REFL-01, SOC-01/02; e a fronteira v2 (ADV-01/02/03, PROV-01) que NÃO entra aqui.
- `.planning/PROJECT.md` — Constraints (Bun runtime, all-TypeScript, LangGraph, LM Studio local v1). A persistência foi **deliberadamente adiada para esta fase** ("decidir com evidência: SQLite vs JSON vs vector store"). Core value: o loop (perceber → decidir → agir) precisa sempre funcionar.
- `.planning/STATE.md` — Sinalização para research: estratégia de persistência e scoring de recuperação semântica.

### Prior Phase Context (decisões que esta fase carrega/estende)
- `.planning/phases/03-cogni-o-com-llm-loop-completo-necessidades-e-objetivos/03-CONTEXT.md` — **D-20** (holder durável em-processo → esta fase leva ao disco, D-04), **D-01** (persona estática "sobrevivente pragmático" → baseline que D-14 evolui), **D-08** (necessidade `social` stub → D-18 pode ativar), **D-04/D-06** (eixo AUTONOMOUS/ASSISTANT → gates de `trust` em D-17), **D-19** (deliberação LLM single-flight fora do grafo → onde a reflexão D-12 se encaixa), **D-13/D-12** (ring buffer + tokenizer js-tiktoken → fonte da consolidação CP→LP, D-13 desta fase).
- `.planning/phases/02-loop-aut-nomo-e-mem-ria-de-curto-prazo/02-CONTEXT.md` — `PRIORITY_ORDER`/arbiter de regra fixa (fallback da reflexão, D-12), ring buffer de memória (MEM-01), padrão de stub explícito.

### Technology Stack
- `CLAUDE.md` (seção Technology Stack) / `research/STACK.md` — **NÃO usar better-sqlite3/SqliteSaver no Bun** (ABI/NAPI). Usar `bun:sqlite` (built-in) + `sqlite-vec` (vector index, sucessor do sqlite-vss) **ou** `vectra` (JS puro) como fallback. Embeddings via `OpenAIEmbeddings` → LM Studio com **caveat de `baseURL`**. `zod` 4.4.3 para saída restrita; `js-tiktoken` (o200k_base) já em uso na memória.

### Código existente (contratos a respeitar / pontos de integração)
- `src/cognition/state.ts` — `CognitiveStateHolder` e `createCognitiveStateHolder()`: a "mente" durável em-processo. **D-04 estende para disco** — o holder inteiro (control/safety/memory/needs/goals/currentGoal/disposition + novos: long-term memory store, perfis, personalidade) passa a hidratar/persistir.
- `src/memory/shortTerm.ts` — ring buffer `ShortTermMemory` + `MemEvent`; `push` FIFO por orçamento de tokens. **Fonte da consolidação CP→LP (D-13).**
- `src/cognition/types.ts` — enum `CognitiveState` (**D-11 adiciona `reflecting`**) e `MemEvent` (taxonomia que D-05 espelha no `events` persistido).
- `src/cognition/states.ts` — `PRIORITY_ORDER` (D-11 insere `reflecting` com prioridade baixa) e `STUB_STATES`.
- `src/motivation/types.ts` — `Need`/`Goal`/`Disposition`/`NeedKind` (incl. `social` stub, D-18); `lastSatisfiedAt`/`committedAt` são a base do decaimento no boot (D-19).
- `src/cognition/deliberation.ts` + `src/cognition/loop.ts` — deliberação LLM single-flight fora do grafo (Fase 3); **a reflexão D-12 reusa este caminho**, não cria nó novo.
- `src/llm/prompts.ts` — persona base estática; **D-14 injeta o estado de personalidade evolutivo aqui**, sobre a baseline imutável.
- `src/llm/structured.ts` + `src/llm/schemas.ts` — saída restrita Zod + repair/fallback; **a saída da reflexão (resumo + deltas de objetivo) e a importância usam o mesmo padrão (D-13)**.
- `src/chat/conversation.ts` — caminho conversacional; ponto onde eventos sociais (jogador fala/ajuda/ataca) alimentam perfis (D-15/D-16).
- `src/config.ts` — novos knobs (.env): caminho do DB, política de WAL, limiares de importância/reflexão/trust, modelo de embedding.
- `src/bot/index.ts` → `onBotReady`/`startCognitiveLoop`: ponto onde o holder durável é **hidratado do disco no boot** (uma vez) e persistido.

### Fontes de pesquisa (baseline de design)
- **Generative Agents: Interactive Simulacra of Human Behavior** (Park et al. 2023, Stanford) — baseline canônico do *memory stream*: scoring `recência + importância + relevância` (min-max [0,1], α=1), importância 1-10, reflexão por limiar de importância acumulada. Referência para D-07, D-10, D-13. https://arxiv.org/pdf/2304.03442
- **sqlite-vec em Bun** — `sqliteVec.load(db)` carrega no `bun:sqlite`; suporte a colunas de metadados filtráveis no WHERE do KNN. Referência para D-01, D-07. https://alexgarcia.xyz/sqlite-vec/js.html | https://github.com/asg017/sqlite-vec
- **Mem0 / MemoryBank / Affordable Generative Agents** — extração/importância em lote amortizada (alvo de evolução de D-06). https://arxiv.org/html/2504.19413v1

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`CognitiveStateHolder`** (`src/cognition/state.ts`): já é a fonte única da mente em-processo — a Fase 4 o hidrata/persiste em disco (D-04), sem reescrever a forma do estado.
- **Ring buffer + `MemEvent` tipado** (`src/memory/shortTerm.ts`, `src/cognition/types.ts`): a taxonomia rica dá sinal de importância heurística de graça (D-06) e é a fonte da consolidação CP→LP (D-13).
- **Deliberação LLM single-flight fora do grafo** (Fase 3, `deliberation.ts`/`loop.ts`): a reflexão reusa este caminho (D-12) — não há nó novo no `StateGraph`.
- **Saída restrita Zod + repair/fallback** (`src/llm/structured.ts`/`schemas.ts`): aplicada à saída da reflexão e (quando evoluir) ao refino de importância.
- **Persona base estática** (`src/llm/prompts.ts`): baseline imutável sobre a qual o estado de personalidade evolutivo é injetado (D-14).
- **`js-tiktoken` (o200k_base)** já integrado: orçamento de tokens da memória, reaproveitado no contexto recuperado.

### Established Patterns
- **Holder como fonte única / cognição nunca toca o `bot`** (D-10 Fase 1): a persistência grava/lê do holder, não do objeto bot.
- **Single-flight bloqueante** (D-02 Fase 2 / D-19 Fase 3): a reflexão (deliberação cara) respeita — nunca sobrepõe inferência.
- **Stub explícito** (Fighting/Building; `social`/`shelter` needs): mesmo padrão para decidir ativar `social` (D-18).
- **Fallback gracioso para a espinha de regra fixa** (D-17 Fase 3): o arbiter cobre reflexão ocupada/falha (D-12).

### Integration Points
- `src/cognition/state.ts` (hidratar/persistir o holder), `src/cognition/types.ts` + `states.ts` (enum `reflecting` + `PRIORITY_ORDER`), `src/bot/index.ts` (boot/hidratação), `src/cognition/deliberation.ts` (gatilho + produto da reflexão), `src/llm/prompts.ts` (injeção do estado de personalidade), `src/chat/conversation.ts` (eventos sociais → perfis/trust), `src/config.ts` (novos knobs .env).
- **Novo módulo provável:** `src/memory/longTerm.ts` (store SQLite: schema `events`/`players`/`places`, índice vetorial, retrieval scoring) — não existe ainda.

</code_context>

<specifics>
## Specific Ideas

- **Persistência total escolhida pelo usuário:** o agente deve **retomar onde parou** após um restart completo — não só a memória de longo prazo, mas o estado vivo de motivação (needs/goals/currentGoal). Reforça o pilar "identidade viva" da fase. (D-04)
- **Fronteira "evolui mas não é ML" deve ser estrutural** — o usuário é conservador e valoriza fronteiras claras contra escopo creep; por isso personalidade = estado reinjetado, não treino (D-14).
- **Manter o LLM local fora do caminho quente** é o eixo de design dominante (modelo fraco/sempre-ativo): importância heurística (D-06), recuperação gatilhada (D-08), reflexão amortizada (D-10/D-12).
- **Fidelidade ao baseline acadêmico** (Generative Agents) como ponto de partida conservador e defensável, evoluindo só após o tripé recência×relevância×importância estar validado de ponta a ponta.

</specifics>

<deferred>
## Deferred Ideas

- **Refino de importância por LLM em lote no Reflecting** (D-06): alvo de evolução; MVP é heurística pura.
- **Pesos de scoring ajustáveis + pré-filtro por metadados no `sqlite-vec`** (D-07): após o baseline α=1 validar.
- **Recuperação em camadas (gatilho por jogador + varredura ampla no Reflecting) e recuperação em toda deliberação** (D-08): evolução após validar gatilho + piso isoladamente.
- **Verbalização do estado de personalidade por LLM (Opção C)** (D-14): evolução instrutiva; o LLM nunca grava o estado.
- **Knowledge graph de relações sociais** (D-05): só se a pesquisa de relações virar objetivo explícito (fora do MVP).
- **Personalidade adaptativa avançada / aprendizado contínuo / síntese de crenças** (ADV-01/03), **skills estilo Voyager** (ADV-02), **provedores de LLM em nuvem** (PROV-01): v2.
- **Reviewed Todos (not folded):** nenhum todo pendente casou com a Fase 4 (`todo match-phase 4` → 0 matches). O todo `gathering-collectblock-oom` permanece resolvido no backlog 999.1.

</deferred>

---

*Phase: 04-persist-ncia-reflex-o-e-identidade-viva*
*Context gathered: 2026-06-19*
