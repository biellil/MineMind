# Phase 10: Tech Tree DAG + Needs - Context

**Gathered:** 2026-06-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Adicionar ao agente a capacidade de resolver recursivamente os pré-requisitos de um item-alvo via DAG (minecraft-data/recipesFor), popular `Goal.dependsOn`, fazer as necessidades internas (especialmente `resources`) acionarem diretamente a progressão determinística, e evolucionar a seleção de ferramenta de heurística binária para ranking por tier — resultando em progressão autônoma madeira→pedra→ferro confirmada por inventário.

**Dentro do escopo:**
- Módulo puro `src/motivation/tech-tree.ts`: resolver DAG híbrido (grafo completo, executa folha a folha), memo + cap de 8 níveis, fallback gather quando item não tem receita
- `selectGoal` evoluído: filtra goals bloqueados por `dependsOn` não satisfeitas (progress < 1)
- Ponte `resources` need → `gatheringLadder` determinística → DAG acionado sem LLM
- `src/skills/tool-selector.ts`: evolução do `selectToolFor` com ranking por tier (wooden=1, stone=2, iron=3, diamond=4) + pré-flight antes de dig

**Fora de escopo (outras fases):**
- Modos autônomo/assistente (Fase 11)
- Building deliberado (Fase 12)
- Combate completo (Fase 13)
- Aprendizado por reflexão / ajuste de objetivos (Fase 14)
- Curriculum adaptativo ao bioma (TECH-F1) — diferido

</domain>

<decisions>
## Implementation Decisions

### DAG Resolver (TECH-01)

- **D-01:** Estratégia **Híbrida**: ao criar um goal de alto nível (ex: `iron_pickaxe`), `tech-tree.ts` resolve o DAG **completo** com `bot.recipesFor` / `recipesAll` + memo por itemId + cap de 8 níveis. O resultado é o grafo de sub-goals com `dependsOn` preenchido. Porém, **só executa a folha executável** — o ancestral cujo `dependsOn` está vazio ou completamente satisfeito (progress ≥ 1). Quando a folha conclui, o próximo nó desbloqueado vira a nova folha.
- **D-02:** O resolver vive em **`src/motivation/tech-tree.ts`** — módulo puro sem referência ao grafo LangGraph. Assinatura: `resolveDag(targetItem: string, bot: Bot, memo?: Map<string, Goal[]>): Goal[]`. Retorna a lista de sub-goals em ordem topológica com `dependsOn` populado.
- **D-03:** DAG construído **uma vez ao criar o goal de alto nível** (não recalculado a cada tick). Se o estado muda inesperadamente (estação destruída, itens perdidos), o sub-goal atual falha com `no_effect` → o DAG-raiz é reconstruído na próxima tentativa.
- **D-04:** **Cap de 8 níveis** (suficiente para madeira→diamante, na prática ≤5). **Memo por itemId** previne ciclos e recálculo. Quando o cap é atingido, o resolver retorna `{ unresolvable: true }` e o goal pai é marcado como `failed`.
- **D-05:** **Fallback gather**: quando `recipesFor(itemId)` retorna vazio (item sem receita — madeira, pedra, minérios), o sub-goal é do tipo `gather:itemId` (coletar do mundo via `dig`), não `craft`. Isso fecha a cadeia sem LLM: oak_log não tem receita → sub-goal `gather:oak_log`.

### selectGoal com dependsOn (TECH-03)

- **D-06:** `selectGoal` recebe um `Set<string>` de IDs de goals completados. Antes de aplicar histerese, **filtra os candidatos** removendo goals cujo `dependsOn` contém qualquer ID que não esteja no set de completos. Extensão mínima da assinatura atual; backward-compatible (hoje `dependsOn` sempre `[]`, filtro não muda nada).
- **D-07:** Sub-goal é marcado como **completo** quando `goal.progress >= 1` — usando `advanceProgress` (já existente). Não adiciona campo novo ao `Goal`. O execute node já chama `advanceProgress` ao receber `SkillResult.ok = true`.
- **D-08:** Quando `resolveDag` retorna um item `unresolvable` (sem receita e sem como coletar — ex: bloco de bedrock), o goal pai recebe `status: 'blocked'` e é removido dos candidatos de `selectGoal`. O agente não tenta indefinidamente.

### Ponte necessidade → item alvo (TECH-02, TECH-03, TECH-04)

- **D-09:** Quando `resources` está insatisfeita (urgência > `goalThreshold`), a ponte determinística (sem LLM) faz: inspecionar inventário → percorrer `config.gatheringLadder` → identificar o primeiro item da ladder que o agente ainda não tem em quantidade suficiente → esse item vira o **goal de alto nível** passado ao `resolveDag`.
- **D-10:** O DAG é **acionado diretamente** pela não-satisfação da need, sem consultar o LLM para confirmar. O LLM ainda pode sobrescrever com request de jogador (preempção ASSISTANT já existente). A progressão tech-tree é lógica determinística — o LLM fraco não precisa inferir a cadeia.
- **D-11:** A necessidade `resources` é satisfeita por **delta de inventário**: após cada ação grounded (dig/craft), o execute node calcula se o inventário atual já contém itens suficientes da `gatheringLadder`. Reutiliza o contrato grounding (SkillResult/delta) sem lógica nova de satisfação.

### Ferramenta certa por tier (TECH-05)

- **D-12:** O agente equipa **a melhor ferramenta disponível no inventário** (máximo tier). Tabela estática: `wooden_pickaxe=1, stone_pickaxe=2, iron_pickaxe=3, diamond_pickaxe=4` (idem para axe, shovel). Sem consulta ao minecraft-data por tier mínimo do bloco — simples e suficiente para a progressão vanilla.
- **D-13:** O pré-flight de `dig` (**antes** de qualquer tentativa): `selectToolFor(bot, blockId)` verifica se o bloco exige pickaxe/axe/shovel, identifica a ferramenta de maior tier disponível, equipa, e só então inicia o dig. Se não tiver nenhuma ferramenta compatível → retorna `no_effect` imediatamente (TECH-05: "sem cavar a seco e dropar nada").
- **D-14:** O `tool-selector.ts` **evolui o `selectToolFor` atual** (ponto de extensão documentado em D-17 da Fase 9) — mesma função, nova lógica de ranking. O `dig.ts` não muda de ponto de chamada. A tabela tier + o mapeamento `categoria→materiais` ficam em `src/skills/tool-selector.ts`.

### Claude's Discretion

- Estrutura exata de retorno do `resolveDag` (lista plana ordenada vs. árvore aninhada)
- Representação dos IDs de goals de tech-tree (ex: `tech:craft:iron_pickaxe` vs. `craft:iron_pickaxe`)
- Onde no grafo LangGraph o DAG é reconstruído ao receber falha de sub-goal (nó observe ou deliberation)
- Quantidade mínima de cada item da `gatheringLadder` para considerar "satisfeito" (pode vir de config)
- Heurística de "quantidade suficiente" para a satisfaction de `resources` (ex: 16 logs, 32 cobblestone)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Especificação da fase
- `.planning/ROADMAP.md` §"Phase 10: Tech Tree DAG + Needs" — goal, depends-on (Phase 9), TECH-01..05, success criteria
- `.planning/REQUIREMENTS.md` — TECH-01..05 (DAG recursivo, progressão autônoma, dependsOn, needs reordenam, ferramenta por tier)

### Contexto da Fase 9 (pré-requisito direto)
- `.planning/phases/09-placement-crafting-smelting-grounded/09-CONTEXT.md` — D-15 (ponto de extensão de `craft`), D-17 (ponto de extensão de `selectToolFor`), D-13/D-14 (POI station), D-12 (ensureStation)

### Módulos de motivação/goal existentes (a evoluir)
- `src/motivation/types.ts` — `Goal` (dependsOn: string[], progress: number, source: GoalSource), `Need`, `NeedKind`
- `src/motivation/goals.ts` — `generateGoals`, `selectGoal`, `advanceProgress` — os dois últimos são evoluídos (D-06/D-07)
- `src/motivation/needs.ts` — `urgency`, `createNeeds` — lógica de satisfação de resources evolui (D-11)
- `src/cognition/state.ts` — `CognitiveStateHolder` (goals, currentGoal, needs) — estrutura mantida, sem novos campos
- `src/config.ts` — `gatheringLadder` (cadeia de progressão), `resourceTargets`, `goalThreshold`, `hysteresisMargin`

### Skills a evoluir
- `src/skills/dig.ts` — ponto de chamada do `selectToolFor` pré-flight (D-13); `findBlocks` com `gatherSearchRadius`
- `src/skills/executor.ts` — `executeWithSafety` (timeout/abort/bounds) que as skills herdam
- `src/cognition/nodes.ts` — execute node: `advanceProgress` ao receber `SkillResult.ok` (D-07); ponto de reconstrução do DAG

### Contrato de grounding (reusar)
- `src/grounding/types.ts` — `SkillResult`/`SkillOutcome`/`InventoryDelta`
- `src/grounding/capture.ts` — `captureGroundState`, `inventoryDelta`
- `.planning/phases/07-grounding-skillresult/07-CONTEXT.md` — D-01..D-13: convênção de grounding

### API externa
- mineflayer `bot.recipesFor(itemId, metadata, count, craftingTable)` — entry point do DAG (retorna `Recipe[]` ou `[]` se sem receita) — https://github.com/PrismarineJS/mineflayer/blob/master/docs/api.md
- prismarine-recipe `Recipe` (`result`, `requiresTable`, `delta`) — https://github.com/PrismarineJS/prismarine-recipe
- minecraft-data — tabela de blocos e ferramentas necessárias por bloco (via `mcData.blocksByName[name].harvestTools`) — https://github.com/PrismarineJS/minecraft-data

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Goal.dependsOn: string[]` — campo existe com stub `[]`; Fase 10 popula e usa
- `advanceProgress(goal, delta)` — imutável, já em uso no execute node
- `selectGoal(current, candidates, ctx, cfg)` — estender com filtro de bloqueados (D-06)
- `generateGoals(needs, now, cfg)` — base para gerar goal de alto nível de resources (D-09)
- `config.gatheringLadder` — `['oak_log', 'cobblestone', 'stone', 'coal_ore', 'iron_ore', ...]` — pronto para D-09
- `bot.recipesFor` via mineflayer — entry point do resolveDag (D-02)
- `ensureStation('crafting_table' | 'furnace')` (Fase 9) — usado pelo DAG para sub-goals de craft
- POI `'station'` + `nearbyPlaces` (Fase 8.1/9) — reutilizar sem varrer o mundo
- `executeWithSafety` — timeout/abort/bounds; herdado pelas novas skills de tech-tree
- `gatherSearchRadius` — raio de busca de bloco já validado

### Established Patterns
- Módulos puros em `src/motivation/` (sem bot/LLM/config global) — `tech-tree.ts` segue o mesmo padrão
- `selectGoal` puro: recebe tudo por parâmetro, sem estado global
- Skills `(bot, params) ⇒ Promise<SkillResult>` grounded; outcome do delta real
- Event-driven loop (Fase 07.1): `actionFinished` re-percebe → decide próximo passo (encaixa a progressão folha-a-folha do DAG)
- Config deterministico para parâmetros de ambiente (`gatherSearchRadius`, `gatheringLadder`)

### Integration Points
- `selectGoal` (`motivation/goals.ts`): adicionar parâmetro `completedIds: Set<string>` e filtro (D-06)
- execute node (`cognition/nodes.ts`): chamar `advanceProgress` ao receber `SkillResult.ok=true`; detectar quando reconstruir DAG
- `config.gatheringLadder`: base para a ponte need→item (D-09)
- `src/skills/tool-selector.ts`: novo arquivo evoluindo `selectToolFor` com ranking tier (D-12/D-14)
- `dig.ts`: pré-flight usa `tool-selector.ts` novo (D-13) — zero mudança no ponto de chamada

</code_context>

<specifics>
## Specific Ideas

- A fusão GITM-estrutura + MineMind-motivação citada no ROADMAP se concretiza aqui: a `resources` need provê a motivação/urgência, o `tech-tree.ts` provê a estrutura determinística do que fazer — o LLM fraco não precisa conhecer a cadeia toda.
- O padrão "folha executável" é o coração: o agente sempre tem **um** sub-goal concreto para executar (nunca um goal pai bloqueado), e a progressão acontece naturalmente conforme as folhas vão completando.
- O fallback `gather` para itens sem receita (madeira, pedra) fecha o loop sem exceção especial: o DAG resolve tudo, inclusive as "folhas brutas" do mundo.
- `gatheringLadder` como fonte de verdade da progressão elimina a necessidade do LLM conhecer a ordem — é uma decisão de design deliberada que protege o Core Value ("o loop cognitivo precisa funcionar").
</specifics>

<deferred>
## Deferred Ideas

- **Curriculum adaptativo ao bioma (TECH-F1)** — ex: deserto → cacto antes de ferro. Complexidade desnecessária para MVP; a `gatheringLadder` fixada já cobre o caso vanilla.
- **Esticar a tech tree além de diamante (TECH-F2)** — deixar para quando a progressão madeira→ferro→diamante estiver validada ao vivo.
- **Ferramenta mínima por bloco via minecraft-data** — a abordagem "melhor disponível" é suficiente; consultar minecraft-data por tier mínimo só vale se o agente precisar preservar ferramentas boas para uso futuro.
- **Goal-raiz persistente entre sessões** — hoje o DAG é reconstruído a cada boot; persistência do goal de tech-tree pode vir junto com a Fase 14 (aprendizado).

</deferred>

---

*Phase: 10-tech-tree-dag-needs*
*Context gathered: 2026-06-21*
