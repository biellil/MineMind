# Project Research Summary

**Project:** MineMind — milestone v2.0 "Autonomia de Verdade"
**Domain:** Agente autonomo persistente de Minecraft (self-playing) — adicionar sobrevivencia, tech-tree, building, combate, grounding e provider LLM configuravel a um agente Mineflayer + LangGraph 1.x ja existente
**Researched:** 2026-06-19
**Confidence:** HIGH

## Executive Summary

O v2.0 transforma o MineMind de "loop cognitivo que fala e vaga" em "player que sobrevive e progride sozinho". Os quatro pesquisadores convergem num achado central, contraintuitivo e que define o roadmap: **a maior parte do v2.0 NAO e construir componentes novos — e estender costuras que ja existem no codigo e usar a API nativa do Mineflayer.** Craft, smelt, place, attack, consume e furnace sao todos metodos do objeto `bot`; o `arbiter` reativo atual vira o System 1 legitimo; o campo `Goal.dependsOn` (hoje sempre `[]`) vira o DAG da tech-tree; `playerRequestPending` + `source:player_request` ja carregam ~70% do modo assistente; o `progressChecker` do `dig` e a semente do grounding; e a factory `createLmStudioProvider` ganha um irmao `createOpenAiProvider` atras da interface `LlmProvider` que ja abstrai tudo. A unica dependencia quase-obrigatoria e `mineflayer-tool@1.2.0` (peer do `collectblock@1.6.0` ja instalado); `mineflayer-armor-manager` e opcional; `mineflayer-pvp`/`auto-eat` estao **proibidos** (4 anos abandonados, escondem a logica que e o objeto de estudo).

A abordagem recomendada e a arquitetura **System 1 / System 2** do mc-agents: um reflexo puro, sincrono, SEM LLM (comer / fugir / abrigar) que roda no topo do tick por **preempcao** do corpo fisico, e a deliberacao LLM lenta que permanece intocada sob o lock single-flight existente. A distincao critica: **lock de inferencia != lock de atuacao fisica** — o System 1 nunca toca o LLM, entao nao compete pelo `inFlight`; ele compete pela acao fisica e a vence por preempcao, nao por fila. Sobre essa base, a tech-tree e um DAG data-driven (`minecraft-data`) que preenche `dependsOn` e e priorizado pelos needs internos ja existentes (a fusao GITM-estrutura + MineMind-motivacao que e o diferencial do projeto). O provider cloud e **GPT-4.1-mini** (decisao do usuario, nao gpt-5.x), com LM Studio mantido como default custo-zero e embeddings sempre locais.

O maior risco nao esta nas features novas isoladas, mas na **integracao com o debito do v1.0**. Tres pre-requisitos sao intransponiveis e ordenam tudo: (1) **Grounding** — verificar delta de inventario/mundo antes/depois de cada acao, nao "a Promise resolveu"; sem isso a tech-tree e o aprendizado por reflexao corrompem (e o bug "peguei 10 tabuas" que o milestone existe para matar). (2) **A regressao do "grudar no jogador"** que o usuario odeia — modelar assistente como objetivo com condicao-de-saida (nao maquina de modos paralela) e ter um teste de regressao "se afasta sozinho" como gate ao vivo. (3) **O OOM do pathfinder** — o fix do 999.1 ficou localizado no collectblock; building, combate e tech-tree chamam pathfinder por conta propria sem herdar os bounds. Some-se a isso que a **Fase 4 nunca foi verificada ao vivo** e o aprendizado por reflexao depende inteiramente dela funcionar de verdade.

## Key Findings

### Recommended Stack

A stack v2.0 e quase toda a stack v1.0 reusada — o `package.json` real ja esta em LangChain 1.x (`@langchain/core 1.2.0`, `langgraph 1.4.4`, `openai 1.5.1`) e `collectblock 1.6.0` (divergencia do STACK v1.0, que documentava 0.4.x/1.4.4). Crafting, smelting, building, combate, comida e deteccao de mobs sao **API nativa do Mineflayer** — zero biblioteca nova. Detalhe completo em `STACK.md`.

**Core technologies (ja presentes):**
- **mineflayer 4.37.1**: interface do jogo + API nativa (`recipesFor`/`craft`, `placeBlock`, `equip`, `openFurnace`, `attack`, `consume`) — toda a base de sobrevivencia/combate/building/progressao sai daqui
- **@langchain/openai 1.5.1**: ponto de extensao do provider — mesma `ChatOpenAI` serve LM Studio (baseURL local) e GPT-4.1-mini (apiKey real, sem baseURL)
- **@langchain/langgraph 1.4.4**: StateGraph do loop cognitivo — mantido intacto (topologia 5-nos preservada)
- **minecraft-data 3.111.0** (transitiva): fonte de verdade data-driven para o DAG de receitas/pre-requisitos da tech-tree

**Adicoes minimas:**
- **mineflayer-tool 1.2.0** — quase obrigatoria (peer do collectblock 1.6.0; habilita "minerar com a ferramenta certa" na progressao de tiers)
- **mineflayer-armor-manager 2.0.1** — opcional, sobrevivencia barata (auto-equipar melhor armadura)
- **NAO adicionar** mineflayer-pvp nem mineflayer-auto-eat (abandonados; usar API nativa)

### Expected Features

Detalhe e prior-art (Voyager/GITM/mc-agents/Mindcraft) em `FEATURES.md`. "Table stakes" aqui = "sem isto o bot nao e um player autonomo — e um boneco que vaga e morre".

**Must have (nucleo do v2.0 — P1):**
- Camada reflexa System 1 (comer + fugir/defender mob + abrigo de emergencia) — sem isso o bot morre antes de qualquer plano
- Grounding de acoes (relato = mundo real verificado) — pre-requisito de TODA a progressao
- Crafting + smelting confiavel sobre o grounding
- Cadeia tech-tree wood->stone->iron como objetivos hierarquicos com pre-requisitos (DAG)
- Modo Autonomo default (self-prompting) + Modo Assistente temporario (atende e volta sozinho)

**Should have (diferenciadores — o que faz "viver e aprender", nao clonar Voyager):**
- Objetivos hierarquicos guiados por needs internos (motivacao interna reordena o DAG em runtime)
- Aprendizado por reflexao sobre experiencia PROPRIA (mortes/falhas ajustam objetivos futuros)
- Transicao autonomo<->assistente coerente com a persona

**Defer (v2.x / pos-v2.0):**
- Building deliberado e Fighting completo (P2 — apos sobrevivencia reflexa provada)
- Fechamento do loop de aprendizado (P2 — depende do live-verify da Fase 4)
- Anti-features confirmadas: skill library de codigo LLM-gerado, observar/imitar players, zerar o jogo (Nether/End), PvP humano, blueprints/megaestruturas, self-verification so-LLM

### Architecture Approach

Detalhe em `ARCHITECTURE.md` (lido contra o codigo real). Tese: nada em v2.0 e componente de topo novo — estender as costuras existentes. **Nao criar maquina de modos paralela, nao criar no de reflexao no grafo, nao criar segundo loop.** O System 1 e funcao pura no driver (fora do grafo); a reflexao reusa o `trigger:reflect` da deliberacao.

**Major components (NOVO vs MODIFICADO):**
1. **System 1 reflexo** (`cognition/reflexes.ts`, NOVO) — `decideReflex(snapshot, holder)` puro, sincrono, sem LLM; precedencia por preempcao sobre o `execute` deliberado
2. **Tech-tree DAG** (`motivation/techtree.ts`, NOVO) — catalogo data-driven via `minecraft-data`; resolucao recursiva com memo + limite de profundidade; preenche `Goal.dependsOn`
3. **Grounding** (`skills/grounding.ts` + `result.ts`, NOVO) — wrapper antes/depois -> `SkillResult` verificado; generaliza o `progressChecker` do `dig`
4. **Skills nativas** (`craft`/`smelt`/`place`/`eat`/`flee`/`shelter`, NOVO) sobre API nativa; `navigate`/`dig`/`follow`/`attack` MODIFICADAS para retornar `SkillResult`
5. **LLM Provider Factory** (`llm/provider.ts`, MOD) — `createOpenAiProvider` (GPT-4.1-mini) irmao de `createLmStudioProvider`, despacho por `config.llmProvider`
6. **Modo Assistente** (MOD/reuso) — `Goal{source:player_request}` + `playerRequestPending` + preempcao em `selectGoal` (ja existem); falta so a condicao de saida (TTL/progress) e reversao de disposition

### Critical Pitfalls

Top 5 de `PITFALLS.md` (que foca deliberadamente em integracao com o debito do v1.0):

1. **Grounding superficial** — verificar "Promise resolveu" em vez de delta de estado. `bot.craft`/`placeBlock`/`collectBlock` resolvem antes do efeito real. Evitar: snapshot de inventario/posicao antes-depois; `ActionResult` tipado onde `ok = observed satisfaz expected`; memoria/chat consomem `observed`, nunca o plano.
2. **Reflexo vs. single-flight (deadlock / comida tardia)** — o System 1 NAO pode passar pelo lock do LLM. Evitar: separar lock de inferencia de lock de atuacao; System 1 nunca chama LLM; **preempcao, nao fila** (so vida-critica preempta — histerese para nao voltar a oscilacao).
3. **Regressao "grudar no jogador"** — o comportamento que o usuario odeia. Evitar: assistente = objetivo com condicao-de-saida explicita (nao modo paralelo); neutralizar o GoalFollow/socializing do v1.0 (fonte do commit `0b4dc64`); teste de regressao "sem pedido, se afasta e faz suas coisas" como gate ao vivo.
4. **Tech-tree sem autocraft nativo** — `recipesFor` para item 3x3 sem passar `craftingTable` retorna vazio -> "impossivel" falso ou recursao infinita; estacao precisa ser `Block` real no mundo. Evitar: resolvedor recursivo com `minecraft-data` + memo + limite de profundidade; estacoes como nos do DAG; pre-flight de ferramenta antes de minerar.
5. **OOM do pathfinder reaparece [INTEGRACAO]** — o fix do 999.1 ficou no collectblock; building/combate/tech-tree chamam pathfinder sem herdar bounds. Evitar: aplicar `searchRadius`/`thinkTimeout`/pre-check `getPathTo` a TODA chamada nova; goal inalcancavel = falha rapida; re-rodar soak overnight.

Pitfalls adicionais a vigiar: custo cloud em loop 24/7 (#6, gate por frequencia + caching + teto de gasto), divergencia structured-output local<->GPT (#7, testar paridade nos dois), `placeBlock` fragil (#5, wrapper timeout + `blockAt`), perigos ambientais lava/queda/afogamento (#11, guardas reflexos), Fase 4 nao-verificada como base do aprendizado (#10).

## Implications for Roadmap

A ordem e **dependencia-dirigida**: infra (provider + grounding) destrava tudo; System 1 garante que o bot sobrevive tempo suficiente para a progressao rodar; building/combate "de verdade" vem por ultimo porque dependem de place e sobrevivencia ja provados. Os 4 pesquisadores convergem nesta sequencia.

### Phase 1: LLM Provider Factory (GPT-4.1-mini + LM Studio)
**Rationale:** Isolado, baixo risco, destrava reasoning melhor para validar o resto. Nao depende de gameplay novo.
**Delivers:** `createProvider()` + `createOpenAiProvider()` + config `llmProvider`; trocar provider por env sem tocar o loop; embeddings sempre locais (custo-zero).
**Addresses:** "LLM configuravel" (Active requirement).
**Uses:** `ChatOpenAI` (ja presente), interface `LlmProvider` (LLM-03).
**Avoids:** custo cloud descontrolado (#6 — gate de frequencia + effort baixo + teto de gasto entram JUNTO com a abstracao), divergencia local<->GPT (#7 — paridade dos dois providers e criterio de aceite).

### Phase 2: Grounding + SkillResult
**Rationale:** Pre-requisito de TUDO em progressao; e infra, nao gameplay. Mata o bug central do milestone.
**Delivers:** `SkillResult` por delta verificado; skills existentes (navigate/dig/follow/attack) convertidas; `execute` grava o factual. Marco: "relato = mundo".
**Implements:** `skills/grounding.ts` + `result.ts` (generaliza o `progressChecker` do `dig`).
**Avoids:** Grounding superficial (#1).

### Phase 3: System 1 reflexo (comer + fugir/defender) + guardas ambientais
**Rationale:** Sem isto o bot morre antes de qualquer plano. A separacao inferencia-lock vs. atuacao-lock e decisao de design ANTES de escrever o reflexo.
**Delivers:** `reflexes.ts` puro + skills `eat`/`flee` (API nativa) + precedencia por preempcao no driver; deteccao de mob hostil no arbiter; guardas anti-lava/queda/afogamento. Marco: nao morre de fome, mob trivial ou perigo ambiental.
**Implements:** System 1 (mc-agents); promove o arbiter reativo.
**Avoids:** Reflexo vs. single-flight (#2), perigos ambientais (#11).

### Phase 4: Placement + abrigo de emergencia
**Rationale:** `placeBlock` e compartilhado por abrigo (reflexo), building e posicionar bancada/fornalha — implementar o wrapper robusto uma vez, na primeira feature que precisa.
**Delivers:** skill `place` (wrapper timeout + verificacao `blockAt` + limpeza de listeners) + `shelter` reflexo. Marco: bot se abriga a noite sem auto-sufocar.
**Avoids:** `placeBlock` fragil/silencioso (#5).

### Phase 5: Crafting + smelting grounded
**Rationale:** Depende do grounding (Fase 2) e do placement (Fase 4 — bancada/fornalha sao blocos no mundo).
**Delivers:** `craft`/`smelt` na API nativa, cada um grounded. Marco: tabuas->bancada->ferramenta->fornalha->ferro veridicos (inventario confirma).

### Phase 6: Tech-tree DAG + needs
**Rationale:** Objetivo central declarado; depende de grounding + crafting + placement. Ponto mais provavel de precisar pesquisa mais profunda.
**Delivers:** `techtree.ts` (resolucao recursiva data-driven) + `generateGoals`/`selectGoal` resolvendo `dependsOn`; needs `shelter` ativos. Marco: progride wood->stone->iron sozinho, priorizado por need.
**Implements:** fusao GITM (estrutura DAG) + MineMind needs (prioridade dinamica) — o diferencial.
**Avoids:** receitas recursivas que nao terminam / estacao errada (#4), OOM em busca de recurso (#9).

### Phase 7: Modo Assistente (condicao de saida)
**Rationale:** ~70% ja no codigo; falta a condicao de saida e a reversao de disposition. E objetivo de alta prioridade, nao modo paralelo.
**Delivers:** parse de pedido -> `Goal{source:player_request}` + TTL + reversao; reusa preempcao existente. Marco: atende pedido e volta sozinho.
**Avoids:** regressao "grudar no jogador" (#3 — teste de regressao "se afasta sozinho" e gate ao vivo).

### Phase 8: Building deliberado (P2)
**Rationale:** Trigger — placement reflexo estavel (Fase 4). Estado `building` real alem do abrigo.
**Avoids:** OOM pathfinder na busca de referencia (#9), `placeBlock` em rajada flagavel (anti-cheat v1.0).

### Phase 9: Fighting completo (P2)
**Rationale:** Trigger — sobrevivencia reflexa provada (Fase 3); "hora de atacar e nao so fugir". Estado `fighting` real com `mineflayer-tool`/armor.
**Avoids:** combate — perder alvo/cooldown/kiting suicida (#8), OOM pathfinder ao aproximar/recuar (#9).

### Phase 10: Fechar o loop de aprendizado (P2)
**Rationale:** Depende de grounding (Fase 2) pronto E do live-verify da Fase 4. Reflexao (ja existe) ajustando selecao de goals.
**Delivers:** mortes/falhas grounded influenciam objetivos futuros observavelmente. Marco: "morri sem abrigo -> priorizo abrigo na proxima noite".
**Avoids:** aprendizado placebo sobre Fase 4 nao-verificada (#10), refletir sobre acoes alucinadas (#1).

### Phase Ordering Rationale

- **Infra antes de gameplay:** Provider (1) e Grounding (2) nao dependem de mundo novo e destravam o resto — Grounding e pre-requisito explicito de TODA a progressao.
- **Sobrevivencia antes de progressao:** System 1 (3) + abrigo (4) garantem que o bot vive tempo suficiente para a tech-tree (5-6) rodar; um bot que morre em 20 min nunca progride.
- **Placement compartilhado cedo (4):** abrigo de emergencia e building usam o mesmo primitivo `placeBlock`, e crafting precisa de bancada/fornalha posicionadas — implementar o wrapper robusto uma vez.
- **Building/Fighting por ultimo (8-9):** dependem de place (4) e sobrevivencia reflexa (3) ja provados; sao P2 por design.
- **Aprendizado fecha o ciclo (10):** depende de grounding confiavel (2) e do debito da Fase 4 resolvido — construir antes seria placebo.

### Research Flags

Fases que provavelmente precisam de `/gsd:research-phase` no planejamento:
- **Phase 6 (Tech-tree DAG):** parte mais dificil; resolucao recursiva de receitas com `minecraft-data`, estacoes como nos, profundidade/memo — `PITFALLS.md` marca explicitamente como o ponto mais provavel de pesquisa profunda.
- **Phase 9 (Fighting):** orquestracao manual de combate sem `mineflayer-pvp` (cooldown ~0.6s, re-selecao de alvo, kiting, desengajar) — superficie de falha alta.
- **Phase 10 (Aprendizado):** depende de resolver o Known Gap nao-verificado da Fase 4 ao vivo; precisa de protocolo de verificacao de influencia, nao so de registro.

Fases com padroes bem documentados (provavelmente skip research-phase):
- **Phase 1 (Provider):** mesma `ChatOpenAI`, so troca de config; padrao claro em `ARCHITECTURE.md`.
- **Phase 2 (Grounding):** padrao ja provado no `dig`; e generalizacao, nao invencao.
- **Phase 3-5 (System 1 / placement / craft-smelt):** API nativa do Mineflayer documentada; padrao mc-agents claro.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Versoes verificadas no npm registry 2026-06-19; `package.json` real lido; APIs nativas confirmadas na doc oficial Mineflayer; modelo GPT-4.1-mini e decisao fixada do usuario |
| Features | HIGH | Prior art forte e bem documentada (Voyager/GITM/mc-agents/Mindcraft); medido contra o que o v1.0 ja entregou |
| Architecture | HIGH | Pesquisa feita contra o CODIGO REAL (loop.ts, nodes.ts, goals.ts, provider.ts etc.), nao contra docs; corrige drift do ARCHITECTURE v1.0 |
| Pitfalls | HIGH | Failure modes verificados em issue trackers do Mineflayer/pathfinder + post-mortems; integracao com debitos do v1.0 confirmada via PROJECT.md |

**Overall confidence:** HIGH

### Gaps to Address

- **Fase 4 nao verificada ao vivo (Known Gap do v1.0):** o aprendizado por reflexao (Fase 10) depende dela funcionar de verdade. Resolver o live-verify (reflect dispara, KNN retorna licoes relevantes, perfis influenciam decisao) como gate de entrada da Fase 10, nao em paralelo.
- **`[reflect]` ao vivo nao confirmado pos-B1:** re-testar limpo DEPOIS de introduzir o System 1, pois a nova camada muda quando o lock do LLM fica livre.
- **Caveat zod v4 <-> `withStructuredOutput` (langchainjs #8357):** validar ao vivo nos dois providers; fallback `zodToJsonSchema` -> JSON Schema cru. Resolver na Fase 1 (Provider).
- **Workaround de OOM ativo (`PERCEPTION_RADIUS` baixo):** separar raio de percepcao de raio de busca consistentemente nas features novas; o raio baixo pode esconder recursos da tech-tree que existem logo alem.
- **Meta-item da tech-tree:** a resolucao recursiva precisa de um goal-item atual (qual item perseguir) — derivar do estado (sem picareta de pedra -> meta = picareta de pedra) ou do modo assistente. Definir na Fase 6.

## Sources

### Primary (HIGH confidence)
- `.planning/research/STACK.md` — versoes npm 2026-06-19, API nativa Mineflayer, provider GPT-4.1-mini, cuidados de custo no loop
- `.planning/research/FEATURES.md` — prior art Voyager/GITM/mc-agents/Mindcraft, System 1/2, DAG, grounding como pre-requisito, anti-features
- `.planning/research/ARCHITECTURE.md` — lido contra o codigo real do projeto; costuras existentes, build order dependencia-dirigida
- `.planning/research/PITFALLS.md` — issue trackers Mineflayer/pathfinder + integracao com debito v1.0
- `.planning/PROJECT.md` — milestone v2.0, Known Gaps, Key Decisions
- Codigo real do projeto (loop.ts, nodes.ts, goals.ts, provider.ts, package.json) — ground truth da arquitetura
- Doc oficial Mineflayer (api.md), OpenAI API docs (reasoning.effort, structured outputs, caching)

### Secondary (MEDIUM confidence)
- Precos GPT (agregadores aipricing.guru / pricepertoken) — ordem de grandeza
- langchainjs #8357 (caveat zod v4) — validar ao vivo
- typevar.dev (validacao stack all-JS + LLM local)

### Tertiary (LOW confidence)
- Limitacao de self-correction intrinseca LLM (discussao em torno de Voyager) — usado como justificativa de anti-feature

---
*Research completed: 2026-06-19*
*Ready for roadmap: yes*
