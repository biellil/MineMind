# Phase 12: Building Deliberado - Context

**Gathered:** 2026-06-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Implementar o estado `building` **real** (hoje stub) além do abrigo de emergência reflexo da Fase 8: construir um **abrigo funcional deliberado** (fecha de verdade, sem buracos, sem auto-sufocar, validado por `blockAt`) e **estruturas simples** (parede / torre / posicionar estação) de forma **autônoma**, reusando o primitivo robusto `placeBlockSafe`/`getRefAndFace` da Fase 9.

**Dentro do escopo:** builder genérico que executa um *blueprint* (lista de `{pos, bloco}`) com pacing/abort/retry/validação; geradores determinísticos de estruturas conhecidas (abrigo, parede, torre, posicionar estação) a partir de `{tipo, dims, origin}`; caminho ad-hoc em que o LLM fornece a lista de blocos crua (com rede de segurança); ativação autônoma via need de abrigo + pedido do jogador, roteada por goal `build:*` determinístico; grounding de conclusão por cobertura real.

**Fora de escopo (outras fases / deferred):** combate (Fase 13); aprendizado/reflexão sobre falhas de build (Fase 14); coords relativas à origem para listas ad-hoc do LLM (deferred); iluminação/tochas, portas/janelas, construções multi-cômodo e tarefa-de-build persistente entre reinícios (deferred).

Esclarecemos COMO implementar o que já está no escopo. Capacidades novas pertencem a outras fases.

</domain>

<decisions>
## Implementation Decisions

### Builder genérico — place em série (Área D / BUILD-02, BUILD-03)
- **D-01:** **Builder genérico idempotente** que recebe um **blueprint** (lista de `{pos, bloco}`) e o executa numa skill-run: para cada alvo → `getRefAndFace` → `placeBlockSafe` → verifica por `blockAt`. **`gaussianDelay` + checagem de `AbortSignal` ENTRE cada bloco** — preemptável sem a lentidão de 1-bloco-por-tick. Espelha o padrão "smelt re-roda entre itens" (Fase 9 / D-06): cada bloco é um ponto de cedência natural ao System 1.
- **D-02:** **LIGAR `placeRetries`** (campo reservado na Fase 9 / D-04, explicitamente diferido para cá): 2–3 tentativas **idempotentes** por bloco (re-`lookAt` / re-`equip`; nunca recolocar se o alvo já está preenchido), para o race do `blockUpdate` que o building encadeado expõe mais.
- **D-03:** **Retomada natural por idempotência:** re-rodar o blueprint **pula** posições já preenchidas (`isFilled`); `outcome = success` só com **cobertura total** da casca, senão `partial`. Build interrompido por preempção (noite/mob) é retomado re-selecionando o goal `build:*` — sem subsistema de pendência persistente.
- **D-04:** **Rede de segurança do builder:** cada alvo passa por `getRefAndFace`; **sem face alcançável OU já preenchido → pula** o alvo. Uma lista ruim (do LLM ou do gerador) **NUNCA soterra o bot nem lança** (Core Value) — degrada para `partial`/`no_effect`, reusando o grounding da Fase 9 (verdade = `blockAt`, não a Promise).
- **D-05:** **Ordem de colocação** determinística que preserva *reach* e não auto-soterra (baixo→cima, fora→dentro; o bloco da própria célula do bot por último, ou o bot se reposiciona). Algoritmo fino é Claude's discretion.

### Especificação de estruturas — blueprint híbrido (Área B + reconciliação A/B)
- **D-06:** Modelo **HÍBRIDO**. O builder genérico (D-01) executa um blueprint **venha de onde vier** — gerador determinístico ou lista crua do LLM.
- **D-07:** Estruturas **CONHECIDAS** (abrigo, parede, torre, posicionar estação) = **geradores determinísticos** que produzem o blueprint a partir de `{tipo, dims, origin}`. O **LLM escolhe O QUE e ONDE** (tipo + dimensões + origem), **não** cada coordenada — alinha com a filosofia da Fase 9 (LLM = diretor criativo; skill = engenheiro de precisão). O modelo local é fraco em coordenadas (causa-raiz que a Fase 11.1 atacou).
- **D-08:** Estruturas **AD-HOC / criativas** = o **LLM fornece a lista de blocos crua** (coords absolutas) e ela passa pelo **mesmo** builder + rede de segurança (D-04). Coords **relativas à origem NÃO foram adotadas** nesta fase (usuário priorizou validação sobre coords relativas) — fica como refinamento futuro se o modelo local errar muito ao vivo (ver Deferred).

### Abrigo funcional deliberado (Área A / BUILD-02)
- **D-09:** Geometria = **vedação total estendendo a mecânica do reflexo da Fase 8** (cavar-e-tampar / pilar 1×1) para **fechar TODOS os lados** — o abrigo deliberado sela completamente o espaço do bot. É produzido por **gerador determinístico** (D-07), **NÃO** por lista do LLM: o caminho de sobrevivência (SC1) fica determinístico.
- **D-10:** **Validação de "fechado de verdade":** `blockAt` nos vizinhos da(s) célula(s) do bot — todos sólidos = selado (sem buraco, sem auto-sufocar). `outcome` **grounded por cobertura real**, nunca pela resolução da Promise (convenção Fase 7).
- **D-11:** **Distinto do reflexo da Fase 8:** o abrigo deliberado é **proativo** (antes do perigo, selecionado por need/goal quando seguro); o reflexo de emergência (`shelter.ts`, sub-segundo, `lifeCritical`) **mantém precedência** e **não é tocado** nesta fase.

### Ativação / roteamento do estado building (Área C)
- **D-12:** Building é selecionável **AUTONOMAMENTE**: **need de abrigo/segurança** (noite + sem teto) **E** **pedido direto do jogador** (assistente, Fase 11) geram um goal `build:shelter` / `build:wall` / `build:tower` / `build:station`. Cumpre SC2 (estrutura autônoma).
- **D-13:** **Roteador determinístico por prefixo de goal `build:*`** espelhando o roteador DAG da Fase 10 (`goalToSkillParams` em `nodes.ts`) — resolve goal→skill build **sem** depender do LLM conhecer a mecânica de construção.
- **D-14:** O dispatch **atual** do estado `building` (Fase 9 / G-01: agrega os verbos individuais craft/smelt/equip/place) permanece **INTACTO** — a construção deliberada entra por um **caminho separado** (goal `build:*`), sem acoplar nem quebrar a Fase 9.
- **D-15:** O reflexo de sobrevivência da Fase 8 **mantém precedência de preempção**; o building deliberado **NÃO preempta nada** e é abandonado/retomado se um `lifeCritical` disparar (reusa a preempção generalizada já existente no execute node, `nodes.ts` §L470-480).

### Bounds / pacing (carregado das fases anteriores — reafirmado como critério de aceite, SC3)
- **D-16:** Toda navegação nova do building (buscar referência, posicionar-se para alcançar os blocos) **herda os bounds do pathfinder 999.1** (searchRadius / thinkTimeout / pré-check `getPathTo`). Pacing anti-cheat via `gaussianDelay` entre blocos (D-01). Sem OOM em soak.

### Claude's Discretion
- Nomes de arquivos/helpers (ex.: `builder.ts`, geradores de blueprint, skill `build`) e organização interna.
- Forma exata do schema Zod do `build` (`{tipo, dims, origin}` + caminho ad-hoc de lista crua), valores de `placeRetries` (2 vs 3) e do delay entre blocos.
- Algoritmo exato de ordenação de colocação (D-05) e heurística de seleção de material do inventário (preferir descartáveis cobblestone/dirt sobre úteis), reusando o `PLACEABLE`/lista do `shelter.ts`.
- Dimensões default de parede/torre e o gatilho fino do **need de abrigo** (limiar de noite / sem-teto).
- Mecânica de retomada do build parcial (reusar `actionFinished` / outcome `partial` como no smelt da Fase 9).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Especificação da fase
- `.planning/ROADMAP.md` §"Phase 12: Building Deliberado" — goal, depends-on (Fase 9 placeBlock robusto, Fase 11 building é goal autônomo), 3 success criteria.
- `.planning/REQUIREMENTS.md` — BUILD-02 (abrigo funcional, estado building real), BUILD-03 (estruturas simples: parede/torre/posicionar estação).

### Primitivo a reusar (núcleo da fase — NÃO reimplementar)
- `src/skills/placeBlock.ts` — `placeBlockSafe` (outcome deriva de `blockAt`, engole timeout de `blockUpdate` como falso-negativo) + `getRefAndFace` (puro: escolhe vizinho sólido + faceVector) + `isFilled` + schema `PlaceBlockSchema`. **`config.placeRetries` reservado aqui (D-04 da Fase 9) — esta fase liga o corpo do retry (D-02).**
- `src/skills/shelter.ts` — mecânica do **reflexo de emergência** da Fase 8 (cavar-e-tampar / pilar 1×1, guarda anti-lava, `PLACEABLE`). A vedação total deliberada (D-09) **estende** esta mecânica; o reflexo em si permanece intacto (D-11).
- `src/skills/station.ts` — `ensureStation` (findBlock → navega adjacente → fallback `placeBlockSafe` → POI `'station'`). Base do `build:station` (D-12).

### Contrato de grounding (toda skill nova produz isto)
- `src/grounding/types.ts` — `SkillResult`/`SkillOutcome`/`GroundState`. O builder e os geradores retornam este contrato; outcome por cobertura real (D-03/D-04/D-10).
- `src/grounding/capture.ts` / `src/grounding/evaluate.ts` — `captureGroundState` + evaluators puros (molde para `evaluateBuild`).
- `.planning/phases/09-placement-crafting-smelting-grounded/09-CONTEXT.md` — D-01..D-20 (placeBlock robusto, smelt re-roda-entre-itens D-06, equip/grounding local). Convenção que a Fase 12 herda.
- `.planning/phases/08-system-1-sobreviv-ncia-reflexa/08-CONTEXT.md` — shelter reflexo, preempção `lifeCritical`, precedência do System 1 (D-11/D-15).

### Integração no loop (caminho separado, sem quebrar Fase 9/10)
- `src/cognition/nodes.ts` §L62-115 — `DAG_PREFIXES` + `goalToSkillParams` (roteador determinístico de sub-goals); **molde para o roteador `build:*`** (D-13). §L326-349 execute node DAG-routing.
- `src/cognition/nodes.ts` §L392-425 — dispatch atual do estado `building` (G-01: craft/smelt/equip/place) que deve permanecer **intacto** (D-14).
- `src/cognition/nodes.ts` §L464-517 — execute node: AbortController por skill-run, preempção generalizada por `LIFE_CRITICAL_TRIGGERS`, grounding gravado antes do `actionFinished` (D-15; ponto de cedência do builder).
- `src/cognition/arbiter.ts` — arbitragem por prioridade; `building` hoje NÃO é selecionado autonomamente — ativação por need/goal `build:*` (D-12) integra aqui ou via selectGoal.
- `src/cognition/states.ts` — `STUB_STATES` inclui `'building'`; remover do stub ao implementar.
- `src/skills/index.ts` — `skillRegistry`/`toolRegistry`: registrar a skill `build`.
- `src/skills/executor.ts` — `executeWithSafety` + `gaussianDelay` (pacing anti-cheat herdado, D-16).
- `src/config.ts` §L32-36 — `placeTimeoutMs`/`placeRetries`/`gatherSearchRadius` (D-02/D-16); novos limiares de building (dims default, gatilho de need) entram aqui.
- `src/memory/places.ts` — `upsertPlace`/`nearbyPlaces` (POI `'base'`/`'build'` para registrar o abrigo construído, se desejável — opcional).

### Mecânicas externas / API
- mineflayer api.md (`bot.placeBlock`, `bot.blockAt`, `bot.equip`, pathfinder `goto`/`GoalNear`): https://github.com/PrismarineJS/mineflayer/blob/master/docs/api.md
- mineflayer-builder `getFaceAndRef()` — referência de ordenação de colocação + equip pós-pathing: https://github.com/PrismarineJS/mineflayer-builder

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `placeBlockSafe`/`getRefAndFace`/`isFilled` (Fase 9) — primitivo robusto compartilhado; o builder genérico (D-01) é um loop em cima deles. **NÃO reimplementar.**
- Mecânica cavar-e-tampar / pilar 1×1 + `PLACEABLE` + guarda anti-lava em `shelter.ts` (Fase 8) — base da vedação total deliberada (D-09).
- `ensureStation` (`station.ts`) — base do `build:station` (D-12).
- `goalToSkillParams` + `DAG_PREFIXES` (`nodes.ts`) — molde do roteador determinístico `build:*` (D-13).
- `SkillResult` + grounding por delta/cobertura real (Fase 7) — contrato de saída do builder (D-03/D-10).
- `executeWithSafety` + `gaussianDelay` — timeout/abort/pacing herdados pela skill `build` (D-16).
- `config.placeRetries` reservado (Fase 9 D-04) — esta fase liga o corpo (D-02).

### Established Patterns
- Toda skill `(bot, params) ⇒ Promise<SkillResult>` grounded; outcome do mundo (`blockAt`), nunca da Promise.
- Single-flight no execute node + loop event-driven (07.1) re-percebe no `actionFinished` — base da cedência entre blocos (D-01) e da retomada de build parcial (D-03).
- Roteamento determinístico por prefixo de goal (DAG da Fase 10) — desacopla o LLM da mecânica (D-13).
- Preempção generalizada por `LIFE_CRITICAL_TRIGGERS` (Fase 8) com `setGoal(null)` antes do abort — o building cede a vida-crítica (D-15).
- Filosofia LLM=diretor / skill=engenheiro de precisão (Fase 9) — geradores determinísticos no caminho crítico (D-07/D-09).

### Integration Points
- `src/cognition/states.ts`: remover `'building'` de `STUB_STATES`.
- `src/cognition/nodes.ts`: adicionar roteador `build:*` (espelhando DAG), mantendo o dispatch G-01 de verbos intacto.
- `src/cognition/arbiter.ts` / selectGoal: ativação autônoma do goal `build:*` por need de abrigo (D-12).
- `src/skills/index.ts`: registrar skill `build`.
- `src/config.ts`: ligar `placeRetries`; novos limiares de building.
- `src/motivation/needs.ts`/`goals.ts`: need de abrigo → goal `build:shelter` (D-12).

</code_context>

<specifics>
## Specific Ideas

- **Âncora de design (herdada da Fase 9):** o LLM local fraco é "diretor criativo" (escolhe O QUE/ONDE construir e a prioridade); a skill de building é "engenheiro de precisão" (monta o blueprint determinístico, ordena, posiciona, valida). O grounding (Fase 7) impede o LLM de mentir sobre o resultado. O "fecha de verdade" do abrigo (SC1) **não depende do LLM acertar coordenadas** — é determinístico.
- **Híbrido como síntese explícita das escolhas do usuário:** abrigo + estruturas conhecidas determinísticos (segurança no caminho de sobrevivência); LLM monta lista crua só para estruturas ad-hoc/criativas onde errar não mata — sempre atrás da rede de segurança do builder (pular alvo inválido, degradar para partial).
- **Builder = um loop idempotente sobre `placeBlockSafe`** com cedência/abort entre blocos: reusa o que a Fase 9 já provou e adiciona apenas a orquestração de série + retry ligado.

</specifics>

<deferred>
## Deferred Ideas

- **Coords RELATIVAS à origem para listas ad-hoc do LLM** — não adotadas nesta fase (usuário priorizou validação sobre coords relativas em D-08); reconsiderar se o modelo local errar muito coords absolutas ao vivo.
- **Iluminação / tochas dentro do abrigo** (evitar spawn interno de mobs) — fora do escopo (sem garantia de ter tochas no inventário; SC1 é "fechar", não "iluminar").
- **Portas / janelas / entrada com fechamento atrás** — abrigo deliberado sela totalmente na v1; aberturas funcionais ficam para depois.
- **Construções multi-cômodo / casas elaboradas** — escopo é abrigo + parede/torre/estação.
- **Tarefa-de-build persistente entre reinícios** — retomada da Fase 12 é por re-seleção de goal + idempotência (D-03), sem estado externo (espelha a decisão D-07 da Fase 9 para smelt).
- **Aprendizado sobre falhas de build** ("essa parede desabou / esse local não fecha") — Fase 14.
- **`pending todos`:** `gathering-collectblock-oom` — já resolvido no escopo do dig (999.1); building herda `gatherSearchRadius`/bounds 999.1 (D-16). Não foldado: não é capacidade nova desta fase.

</deferred>

---

*Phase: 12-building-deliberado*
*Context gathered: 2026-06-22*
