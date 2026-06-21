# Phase 9: Placement + Crafting/Smelting Grounded - Context

**Gathered:** 2026-06-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Implementar o primitivo `placeBlock` robusto **uma vez** (compartilhado por abrigo/building/estações) e tornar `craft`/`smelt`/`equip` **grounded** (verificados por delta real de inventário/mundo, contrato da Fase 7). A cadeia tábuas→bancada→ferramenta→fornalha→ferro produz resultados verídicos confirmados pelo inventário.

**Dentro do escopo:** wrapper `placeBlock` robusto + refator do `shelter.ts` para usá-lo; skill `craft(itemName, count)` que resolve a receita internamente (2x2 → bancada → `no_effect` se exige mesa sem ter); skill `smelt` por item (loop cede entre itens); skill `equip` standalone + pré-flight em dig/attack; localização/posicionamento/reuso de estações (bancada/fornalha) com registro de POI; grounding/evaluate por skill.

**Fora de escopo (outras fases):**
- Resolução **recursiva** de pré-requisitos / tech-tree DAG via minecraft-data → **Fase 10**.
- Seleção de ferramenta por **tier de mineração** (madeira<pedra<ferro<diamante) → **Fase 10** (aqui só categoria binária).
- Building deliberado / abrigo planejado e proativo → **Fase 12** (aqui o `placeBlock` é o primitivo; o abrigo de emergência reflexo da Fase 8 só é refatorado para consumi-lo).
- Camada de revisita / "tarefa pendente" persistente para lotes grandes de smelting → diferida (ver Deferred).

Esclarecemos COMO implementar o que já está no escopo. Capacidades novas pertencem a outras fases.
</domain>

<decisions>
## Implementation Decisions

### placeBlock robusto + refator do shelter (BUILD-01)
- **D-01:** Novo `src/skills/placeBlock.ts` — função `(bot, params) ⇒ Promise<SkillResult>` que se auto-embrulha em `executeWithSafety` (timeout/abort/bounds 999.1). **Núcleo = A+C**:
  - **(A) Wrapper grounded com swallow seletivo:** chama `bot.placeBlock(ref, face)`, captura o throw e **distingue** `"Event blockUpdate did not fire within timeout"` (falso-negativo em server com lag — o bloco foi colocado, só a confirmação do evento expirou → **engolir e verificar**) de `"No block has been placed : the block is still X"` (falha genuína). O `outcome` deriva de `bot.blockAt(alvo)` pós-ação, **NUNCA** da resolução/rejeição da Promise (convenção GRND-01).
  - **(C) Helper `getRefAndFace` (puro, testável):** dado o alvo XYZ, escolhe o bloco-referência vizinho sólido com **face exposta ao ar e alcançável** e calcula o `faceVector`. Resolve a metade "face exposta correta" do critério #1.
- **D-02:** O wrapper **equipa o bloco na mão antes** de colocar (o `bot.placeBlock` do mineflayer **não** equipa sozinho).
- **D-03:** **NÃO adicionar listeners manuais** de `blockUpdate` — o mineflayer já usa `onceWithCleanup` internamente (não há leak na lib; o leak só apareceria se empilhássemos listeners próprios). Atende "limpeza de listeners (não acumula)" do critério #1.
- **D-04:** **Retry (B) atrás de flag** (não sempre-ligado): 2–3 tentativas com re-`lookAt` + re-`equip`, **idempotente** (não recolocar se o alvo já está preenchido), degradando para `partial`/`no_effect` limpo. Habilitável para building encadeado / pilar 1×1 (onde o timing do ápice do pulo expõe mais o race).
- **D-05:** **Refatorar `src/skills/shelter.ts` AGORA** para consumir o wrapper (cumpre "placeBlock UMA VEZ, compartilhado por abrigo/building/estações"), em **commit isolado**, mantendo os dois branches (cavar-e-tampar / pilar 1×1) e **revalidando os testes do shelter da Fase 7/8** antes de fechar.

### Smelting sem travar — loop cede entre itens (CRAFT-03)
- **D-06:** Modelo **D — por item, loop cede entre itens** (NÃO bloqueante full-cycle, NÃO fire-and-forget com POI persistente). Ciclo: `openFurnace` → põe combustível (se preciso) + input → funde **1 item** → `takeOutput` → **`furnace.close()`** → retorna `actionFinished`. O driver **re-percebe** entre itens (ponto de preempção natural do System 1). Se ainda há input, o execute node **re-roda a skill** no próximo tick.
- **D-07:** **Sem estado persistente novo:** a "tarefa pendente" **é** o input restante dentro da própria fornalha — regroundável a qualquer momento reabrindo o furnace e lendo `inputItem()`/`outputItem()`/inventário. (Evita inventar subsistema de POI/pendência/expiração nesta fase — ver Deferred.)
- **D-08:** **`furnace.close()` obrigatório** no fim e no caminho de abort (Mineflayer permite **1 window aberta por vez** — vazar a window bloqueia interações futuras).
- **D-09:** **Seleção de combustível por densidade:** charcoal → coal (8 itens cada; preferir charcoal por ser renovável) → planks (1.5, descartável p/ 1–2 itens); evitar queimar logs/itens úteis. `putFuel` com `count = ceil(restante / itensPorUnidade)`.
- **D-10:** **Esperar o item** via evento `'update'` da fornalha com **guarda de timeout + AbortSignal**; verdade de grounding = `outputItem()` / `Item` retornado por `takeOutput()`, **nunca** `progress`/`fuel`/estimativa de tempo (estes só dizem *quando* checar).
- **D-11:** Trade-off aceito: ~10s **não-preemptável durante** cada item individual (preempção acontece *entre* itens). Aceitável p/ lotes pequenos de minério (escopo da fase).

### Estação (bancada/fornalha): buscar→reusar→registrar POI (CRAFT-02)
- **D-12:** Política **(c) descobrir-vs-colocar com memória**: helper `ensureStation(tipo)` →
  1. `bot.findBlock({ matching: id, maxDistance: config.gatherSearchRadius })` (raio 16, já validado e independente de `perceptionRadius`);
  2. se achar e alcançável, navega até ficar **adjacente** (`GoalNear`, herdando bounds do 999.1) — necessário porque `bot.craft(recipe, count, tableBlock)` e `bot.openFurnace(furnaceBlock)` exigem o Block real ao alcance;
  3. **fallback**: se `findBlock` retorna `null` ou a estação é inalcançável, usar o `placeBlock` robusto (D-01) para plantar uma do inventário, **deixando-a plantada** (NÃO recolher).
- **D-13:** **Registrar a estação como POI `'station'`** via `upsertPlace` (reusa dedup por bucket espacial GRID 12 da Fase 08.1) para a **Fase 10** reusar via `nearbyPlaces` sem varrer o mundo. O POI é **cache, não verdade** — **re-validar com `findBlock` (grounded)** antes de confiar (a estação pode ter sido destruída).
- **D-14:** Adicionar **`'station'` ao union `PlaceType`** (`src/memory/persistence.ts`) em vez de sobrecarregar `'base'` — mantém a busca por proximidade semanticamente clara para a Fase 10.

### Craft + equip — granularidade (CRAFT-01, CRAFT-04)
- **D-15:** Skill **`craft(itemName, count)`** (Opção A1) — recebe **nome de item + count** (contrato serializável p/ tool-call do LLM via Zod; `Recipe` do prismarine-recipe NÃO serializa). Resolve a receita internamente:
  1. `bot.recipesFor(id, null, count, null)` → tenta **2x2** (inventário);
  2. se vazio, re-resolve **com bancada** (via `ensureStation('crafting_table')`, D-12);
  3. se `requiresTable` mas não há bancada nem como colocar → retorna **`no_effect`** ("precisa de bancada") em vez de deixar `bot.craft` lançar;
  4. `bot.craft(recipe, count, bancadaBlock)`.
  - A resolução **recursiva** de pré-requisitos fica **atrás do mesmo nome de item** → a Fase 10 evolui o miolo de A1 **sem mudar a assinatura nem o registry** (zero retrabalho, zero invasão de escopo).
- **D-16:** **`equip` = B1 + B2 (ambos)**:
  - **(B1) `equip(itemName, destination?)` standalone** no `skillRegistry` — verbo de 1ª classe que o CRAFT-04 nomeia ("equipa a ferramenta/armadura"); o planner LLM pode invocar explicitamente.
  - **(B2) Pré-flight** dentro de `dig`/`attack`: helper `selectToolFor` equipa a ferramenta da categoria certa **antes** de agir — rede de segurança porque o LLM local frequentemente omite o passo de equipar (protege o Core Value: o loop precisa funcionar).
- **D-17:** **Linha de escopo do "apropriado"**: na Fase 9 é **heurística binária por categoria** ("tem alguma pickaxe? equipa; alguma sword/axe? equipa") via `bot.inventory.items().find(matchesCategory)`. **SEM** ranking por material/tier — isso é a seleção por tier de mineração da **Fase 10** (que troca o `find` por um seletor ranqueado mantendo o ponto de chamada).

### Grounding / evaluate (convenção Fase 7, D-04)
- **D-18:** **`craft`**: grounding por **delta de inventário** (`itemsByName`/`InventoryDelta`, idêntico ao `dig`). `expected = recipe.result.count * count`; `observed` = ganho real do item-alvo. `outcome`: `success` se ganhou ≥ esperado, `partial` se menos, `no_effect` se nada mudou (faltou ingrediente/bancada), `error` só em exceção. `recipe.delta` pode validar o esperado, mas a verdade é o delta REAL (GRND-01).
- **D-19:** **`equip`**: grounding **LOCAL** (NÃO delta de inventário — equipar não muda contagem), estilo `bot.food` do `eat.ts` (Pitfall 2 — não tocar o `GroundState` genérico): `observed = (bot.heldItem?.name === alvo ? 1 : 0)` para mão, ou checar o slot de armadura (`bot.inventory.slots[5..8]`) para destinos de armadura; `delta: {}`. `outcome`: `success` se o slot passou a conter o item, `no_effect` se já estava equipado ou item ausente.
- **D-20:** **`smelt`**: grounding por **delta de inventário** do item fundido (ganho de `iron_ingot` etc.) lido após `takeOutput`/reabertura, mais o consumo do input/fuel; `observed`/`expected` por item.

### Claude's Discretion
- Nomes exatos de arquivos/helpers (`placeBlock.ts`, `ensureStation`, `getRefAndFace`, `selectToolFor`) e organização interna.
- Forma exata do schema Zod de cada skill (params), valores de timeout/nº de tentativas do retry (D-04), e o predicado fino de "face exposta/alcançável" (D-01 C).
- Mecânica fina da espera do `'update'` da fornalha e do flag/sinal de "continuar fundindo" no estado do loop (D-06).
- Heurística exata de `matchesCategory` para ferramentas/armadura (D-17), desde que sem ranking por tier.
- Como o execute node sinaliza "re-rodar smelt" entre itens (reusar `actionFinished` / outcome `partial`).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Especificação da fase
- `.planning/ROADMAP.md` §"Phase 9: Placement + Crafting/Smelting Grounded" — goal, depends-on (Fase 7 grounding, Fase 8 placeBlock mínimo), 4 success criteria.
- `.planning/REQUIREMENTS.md` — BUILD-01 (placeBlock confiável c/ verificação+timeout), CRAFT-01 (craft grounded), CRAFT-02 (bancada 3x3), CRAFT-03 (smelting), CRAFT-04 (equipar ferramenta/armadura).

### Contrato de grounding (reusar — núcleo da convenção)
- `src/grounding/types.ts` — `SkillResult`/`SkillOutcome`/`GroundState`/`InventoryDelta`. Toda skill nova produz este contrato (D-18/D-19/D-20).
- `src/grounding/capture.ts` — `captureGroundState(bot, targetPos?)` + `inventoryDelta(before, after)` (helper de delta por-item).
- `src/grounding/evaluate.ts` — `evaluateDig`/`evaluateNavigate` (padrão de evaluate puro por skill, D-04 da Fase 7) — molde para `evaluateCraft`/`evaluateSmelt`/`evaluateEquip`.
- `.planning/phases/07-grounding-skillresult/07-CONTEXT.md` — D-01..D-13: contrato flat tagueado por `outcome`; `observed` é a fonte de verdade; capturar delta mesmo em throw (D-08).

### Código a criar/estender e padrões a reusar
- `src/skills/index.ts` — `skillRegistry`/`toolRegistry`/`SkillFunction`/`SkillTool`; registrar `placeBlock`/`craft`/`smelt`/`equip`.
- `src/skills/shelter.ts` §L52-97 — `placeBlock` MÍNIMO atual (try/catch simples) a ser **refatorado** para o wrapper robusto (D-05); manter branches cavar-e-tampar / pilar 1×1.
- `src/skills/dig.ts` — padrão de skill grounded (captureGroundState before/after, `executeWithSafety`, bounds 999.1, `findBlocks({maxDistance: config.gatherSearchRadius})`); ponto do pré-flight de equip (B2/D-16).
- `src/skills/eat.ts` — padrão **equip→ação→re-equip** + grounding por estado vital LOCAL (não toca GroundState) — molde para `equip` (D-19) e p/ o smelt.
- `src/skills/attack.ts` — outro ponto do pré-flight de equip (B2/D-16).
- `src/skills/executor.ts` — `executeWithSafety` (timeout + watchdog + AbortSignal 4º racer) que as skills novas herdam.
- `src/cognition/nodes.ts` §L289-348 — execute node: `skillRegistry[skill](bot, params)` → `SkillResult`; já deriva memória de `result.outcome` e emite `actionFinished`. Ponto onde o smelt "re-roda entre itens" (D-06) se encaixa.
- `src/memory/places.ts` — `upsertPlace`/`nearbyPlaces` (dedup GRID 12, busca proximidade) para o POI `'station'` (D-13).
- `src/memory/persistence.ts` §L~25 — union `PlaceType`: adicionar `'station'` (D-14).
- `src/config.ts` §L~19 — `gatherSearchRadius=16` (raio de busca da estação, D-12); novos timeouts de place/smelt entram aqui.

### Mecânicas externas / API
- mineflayer api.md (`bot.placeBlock`, `bot.craft`, `bot.recipesFor`/`recipesAll`, `bot.openFurnace` + `Furnace` putFuel/putInput/takeOutput/outputItem/progress/fuel + evento `'update'`, `bot.equip`, `bot.findBlock`): https://github.com/PrismarineJS/mineflayer/blob/master/docs/api.md
- mineflayer `lib/plugins/place_block.js` — origem dos erros `"Event blockUpdate did not fire within timeout of 5000ms"` (falso-negativo) vs `"No block has been placed : the block is still X"` (falha real); `onceWithCleanup`: https://github.com/PrismarineJS/mineflayer/blob/master/lib/plugins/place_block.js
- mineflayer issue #2757 — race do `blockUpdate` em server com lag: https://github.com/PrismarineJS/mineflayer/issues/2757
- mineflayer-builder `getFaceAndRef()` — escolha de refBlock+faceVector + equip pós-pathing: https://github.com/PrismarineJS/mineflayer-builder
- prismarine-recipe — `Recipe` (`result`, `requiresTable`, `delta` Map ±count): https://github.com/PrismarineJS/prismarine-recipe
- Minecraft Wiki — eficiência de combustível (coal/charcoal 8, blaze rod 12, planks 1.5; ~10s/item): https://minecraft.wiki/w/Tutorial:Automatic_smelting
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SkillResult`/`captureGroundState`/`inventoryDelta`/`evaluate*` (Fase 7) — contrato e helpers de grounding prontos; as 4 skills novas seguem o molde.
- `executeWithSafety` — timeout + watchdog + AbortSignal (4º racer) + bounds 999.1; auto-wrap das skills.
- `bot.findBlock`/`findBlocks({maxDistance: config.gatherSearchRadius})` — já usado em `dig.ts`; base do `ensureStation` (D-12).
- `upsertPlace`/`nearbyPlaces` + dedup GRID 12 (Fase 08.1) — base do POI `'station'` (D-13).
- Padrão **equip→ação→re-equip** + grounding vital LOCAL em `eat.ts` — molde direto para `equip` e smelt.
- `placeBlock` mínimo em `shelter.ts` — vira o wrapper robusto (refator, D-05).
- execute node (`nodes.ts`) já consome `SkillResult` e emite `actionFinished` — encaixe do smelt por-item (D-06) sem tocar o grafo.

### Established Patterns
- Toda skill `(bot, params) ⇒ Promise<SkillResult>` grounded; outcome do delta real, nunca da Promise.
- Validação Zod no início de cada skill (`.parse()`); custo por tick já pago.
- Single-flight no execute node; loop event-driven (07.1) re-percebe no `actionFinished` — base da preempção do smelt entre itens.
- Pacing humanizado via `gaussianDelay` no executor (mitiga rajada flagável de placeBlock).

### Integration Points
- `skillRegistry`/`toolRegistry` (`skills/index.ts`): registrar `placeBlock`/`craft`/`smelt`/`equip`.
- `PlaceType` union (`persistence.ts`): + `'station'`.
- Pré-flight de equip (B2): editar `dig.ts` e `attack.ts` (helper `selectToolFor`).
- Smelt re-roda entre itens: reusar `actionFinished`/outcome `partial` no execute node.
- `config.ts`: novos timeouts de place/smelt; `gatherSearchRadius` reusado para busca de estação.
</code_context>

<specifics>
## Specific Ideas

- **Divisão de responsabilidade (âncora do design):** o LLM local (fraco) é "diretor criativo" (intenção/personalidade/prioridade); as skills da Fase 9 são "engenheiro de precisão" (mecânica determinística: resolver receita, achar bancada, escolher combustível, equipar categoria). O grounding (Fase 7) impede o LLM de mentir sobre resultados; o DAG determinístico (Fase 10) monta a sequência. O "ponta a ponta certo" NÃO depende do LLM acertar a cadeia.
- O erro `"Event blockUpdate did not fire"` é falso-negativo em server lagado — engolir e verificar por `blockAt` é o ponto que mais protege o critério #1.
- Smelting "sem travar" resolvido SEM subsistema persistente: a pendência vive na própria fornalha (regroundável) — escolha de "evitar over-engineering".
- Estação como POI `'station'` é o gancho barato que a Fase 10 reusa (não varrer o mundo toda vez).
- Cadeia-alvo verificável ao vivo: tronco→tábuas→bancada→picareta de madeira→pedra→picareta de pedra→ferro→fornalha→ferro fundido, tudo confirmado por inventário.
</specifics>

<deferred>
## Deferred Ideas

- **Camada de revisita / "tarefa pendente" persistente para smelting de lotes grandes (Opção B)** — só adotar quando fundir stacks importar; a Fase 9 resolve com loop-cede-entre-itens (D-06/D-07) sem estado externo.
- **Retry sempre-ligado no placeBlock** — fica atrás de flag (D-04); ligar por default só se o teste ao vivo mostrar necessidade em building encadeado.
- **Seleção de ferramenta por tier de mineração** (madeira<pedra<ferro<diamante) — **Fase 10** (aqui só categoria binária, D-17).
- **Resolução recursiva de pré-requisitos / tech-tree DAG** — **Fase 10** (a craft por nome, D-15, é o ponto de extensão sem mudar assinatura).
- **Place-and-pickup de estação** — rejeitado como política padrão (quebra reuso da Fase 10); reconsiderável só para estação descartável de expedição.
- **Building deliberado / abrigo planejado** — **Fase 12** (reusa o `placeBlock` robusto desta fase).
- **`pending todos`:** `gathering-collectblock-oom` — já resolvido no escopo do dig (999.1); vigiar os bounds de pathfinder nas navegações novas (busca de estação herda `gatherSearchRadius`). Não foldado: não é capacidade nova desta fase.
</deferred>

---

*Phase: 09-placement-crafting-smelting-grounded*
*Context gathered: 2026-06-21*
