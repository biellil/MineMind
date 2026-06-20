# Phase 8: System 1 — Sobrevivência Reflexa - Context

**Gathered:** 2026-06-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Entregar uma **camada reflexa pura, sem LLM** (System 1) que mantém o bot vivo contra os "assassinos rápidos" — fome, mob hostil e perigos ambientais (lava, queda, afogamento) — reagindo em **sub-segundo por PREEMPÇÃO** da ação deliberada em curso, sem competir pelo lock single-flight do LLM.

A 07.1 já entregou o **MECANISMO** (canal): o `TriggerBus` (emite `hungry`/`hostileNearby`/`nightFell`/`dayBroke`/`stuck`/`actionFinished` via edge-detection com histerese/debounce) e o **AbortController** de preempção por skill-run no nó `execute` (hoje só `hostileNearby` preempta). Esta fase entrega a **POLÍTICA**: as skills reflexas de sobrevivência (que não existem hoje — só há navigate/dig/follow/attack), os gatilhos de sobrevivência faltantes (`healthCritical`/afogamento/lava/queda), a função de arbitragem que decide o reflexo vencedor, e a generalização da preempção para todos os gatilhos vida-crítica.

**Fora de escopo (pertence a outras fases):**
- `placeBlock` robusto definitivo → Fase 9 (aqui só um placeBlock **mínimo** de emergência).
- Combate real (manter alvo, recuar, kiting) → Fase 13 (aqui só fuga + 1 golpe defensivo de último recurso).
- Building/abrigo planejado e proativo → Fase 12 (aqui só abrigo de **emergência** reativo).

Esclarecemos COMO implementar o que já está no escopo. Capacidades novas pertencem a outras fases.
</domain>

<decisions>
## Implementation Decisions

### Arbitragem dos reflexos
- **D-01:** Modelo de arbitragem = **prioridade fixa por gravidade, winner-take-all** (Opção A1). O System 1 é uma **função pura no driver** (fora do StateGraph, nunca chama o LLM — preserva a decisão travada do Roadmap v2.0 / 07.1 D-03) que percorre um array ordenado de guards e devolve o reflexo vencedor `{ reflex, preempt }`. É a redução canônica de subsumption (Brooks) ao mínimo de um System 1 puro; determinística e testável por tabela-verdade.
- **D-02:** A distinção "**vida-crítica preempta** vs **age só quando ocioso**" é uma flag booleana `lifeCritical` por reflexo — `true` (lava à frente, afogamento, mob com dano iminente, vida crítica) dispara `skillAbort.abort()` imediato; `false` (fome, abrigo) só roda quando o bot está ocioso (no `actionFinished`), nunca interrompendo a deliberação em curso. Histerese, não fila — só vida-crítica preempta.
- **D-03:** Precedência entre reflexos = índice no array, ordenado por gravidade: **perigo ambiental imediato (lava/afogamento) > mob hostil > queda iminente > fome**. Empates de mesma gravidade resolvem por ordem explícita testável. (Ordem exata é refinável no planejamento desde que respeite "ambiental imediato vence".)
- **D-04:** **Anti-flapping incremental:** a histerese de *gatilho* do TriggerBus (cruzamento de limiar + debounce, já existente) é a 1ª camada. A `commitmentCondition` (manter o reflexo ativo até uma condição de saída — Opção A2) fica **diferida**: só adotar sobre o A1 SE o flapping de borda persistir em teste ao vivo. Não implementar no v1.

### Primitivas de ação (API nativa Mineflayer — zero dep nova)
- **D-05:** **Comer** = `bot.equip(food,'hand')` → `bot.consume()` (Promise oficial que resolve no fim do ato) → re-equipar o `heldItem` salvo. Seleção de comida via `bot.inventory.items()` ∩ `mcData.foods` ordenada por `foodPoints`. Abort no meio da mastigação = `bot.deactivateItem()`. (PROIBIDO `mineflayer-auto-eat` — abandonado ~4 anos.)
- **D-06:** **Fugir** = `GoalInvert(new GoalFollow(mob, R))` com `setGoal(goal, true)` (dynamic) — **não existe `GoalRunAway` nativo**; inverter o "seguir" é a forma idiomática. **Sprint cego** (vetor oposto + `setControlState`) só como *fallback* quando o A* devolve `noPath`/timeout. Toda nova chamada de pathfinder herda os **bounds do 999.1** (searchRadius/thinkTimeout/pré-check getPathTo).
- **D-07:** **Nuance crítica de preempção:** a parada da navegação reflexa usa `bot.pathfinder.setGoal(null)` (parada **imediata/forçada**), **NÃO** `bot.pathfinder.stop()` (gracioso — só para no próximo nó do caminho, latência incompatível com sub-segundo).
- **D-08:** **Abrigo de emergência** = condicional dual: **cavar-e-tampar** se houver bloco sólido 2 abaixo e sem perigo (esconde de ranged/explosão); **pilar 1×1** se cercado em terreno plano. Usa um `placeBlock` **mínimo** (a robustez definitiva é da Fase 9). Checar `blockAt` abaixo antes de cavar (não cair em caverna/lava).
- **D-09:** **Perigo ambiental** = sensor por `physicsTick` lendo `bot.blockAt()` à frente/abaixo (lava/queda) + `bot.oxygenLevel` (afogamento → nadar p/ cima); reação = `pathfinder.setGoal(null)` + recuo. É a **guarda de maior prioridade** (preempta inclusive a fuga — de nada adianta fugir para a lava).
- **D-10:** Cada reflexo segue o padrão existente das skills: `(bot, params) ⇒ Promise<SkillResult>` grounded (delta real observado), auto-embrulhado no estilo `executeWithSafety`.

### Limiares & histerese (conjunto "balanceado" — ancorado nas mecânicas reais MC 1.21)
- **D-11:** **Fome** — comer `enter food≤16 / exit ≥18`. Regen natural **para em food≤17** → migrar o default `hungryThreshold` **6→16** em `config.ts` (6 é limiar de sprint/emergência, não de saúde).
- **D-12:** **Health** — preempta+foge/abriga `enter health≤10 / exit ≥14`. Zumbi Hard ~4.5 HP/golpe → ≤10 dá 2-3 golpes de margem para o reflexo agir antes do tick lento do LLM. Subir `survivalCriticalThreshold` **0.3→0.5**.
- **D-13:** **Mob hostil** — reação **graduada por tipo**: creeper `dist≤10` (>raio de explosão ~7, antes do fuse a 3), melee `≤8`, ranged/skeleton `≤16`; `exit ≥14`; reusar `hostileDebounceMs=800`. (Requer classificar o mob por tipo — `EntityInfo.kind` já existe desde a 07.1.)
- **D-14:** **Ambiente** — afogamento emerge `oxygen≤6 / exit ≥14` (ar ~15s, depois 2 dano/s; ≤6 ≈ 4.5s de margem); bloquear queda só **> 3 blocos** (`dano = blocos − 3`); lava lookahead **2 blocos** à frente.

### Fronteira fugir-vs-defender
- **D-15:** **Fuga por default + revidar reflexo SÓ se encurralado** (Opção D-A2). Fuga é a resposta padrão; quando NÃO há rota de fuga viável, o reflexo dá **1 golpe defensivo** usando a skill `attack` existente — **sem perseguir, sem manter alvo** (1-shot). Cobre SURV-02 literal ("foge OU defende") e resolve o caso-mortal de encurralamento. Combate real (manter alvo/recuar/kiting) permanece **Fase 13**.
- **D-16:** O predicado "estou encurralado?" (sem rota segura) é a condição de arbitragem entre fugir e revidar. Mantê-lo simples e groundável (ex.: A* de fuga retornou `noPath`/timeout + vida baixa). O "revidar" produz um `MemEvent` grounded distinto do "fled-to-safety".

### Abrigo noturno
- **D-17:** Abrigo dispara **só noite + ameaça (reativo)** — anoitecer sozinho NÃO abriga. O bot só cria abrigo de emergência quando há mob hostil próximo (ou vida crítica) à noite e não há rota de fuga. Abrigo planejado/proativo fica para o **building real (Fase 12)**. (`nightFell` é contexto que **agrava** a resposta a mob, não um gatilho de abrigo isolado.)

### Retorno ao System 2 + registro grounded
- **D-18:** **Re-percebe do zero** (Opção B1) — o reflexo, ao terminar, vira mais um produtor de `actionFinished`; o driver re-percebe e re-decide o próximo passo pela aresta-de-retorno event-driven já existente (07.1). **NÃO** retomar a ação abortada (Opção B2 rejeitada: empurraria continuação para perto do grafo — proibido — e o mundo pós-reflexo frequentemente invalida a skill original). Como o reflexo nunca toca o LLM, o lock `inFlight` libera pelo mesmo caminho já testado → menor risco de regredir o `[reflect]`.
- **D-19:** **Registrar o reflexo como `MemEvent` grounded** (Opção B3, obrigatório junto do D-18) — o reflexo emite um `SkillResult`-like (`outcome`/`observed`/`expected`) pelo mesmo pipeline da Fase 7, derivado do efeito observado (HP estabilizou? mob saiu do raio? comeu de fato?). Torna o System 1 **observável** para o System 2 (princípio subsumption) e alimenta a reflexão da Fase 14 ("fugi sem abrigo → priorizo abrigo"). **Debounced/coalesced** para não inundar a memória a cada re-trigger.

### Verificação (critério de aceite #4 — não é decisão, é gate)
- **D-20:** Após introduzir o System 1, um **re-teste limpo AO VIVO** deve confirmar que o `[reflect]` ainda dispara (a nova camada muda *quando* o lock do LLM fica livre — a regressão B1 não pode reaparecer). Registrar como item de verificação humana da fase.

### Claude's Discretion
- Estrutura interna/nomes da função de arbitragem e dos guards, e a forma exata dos `SkillResult`-like dos reflexos.
- Mecânica fina de cada primitiva nativa (assinaturas exatas de `consume`/`equip`/`placeBlock`/`blockAt`) e a escolha condicional cavar-vs-pilar em runtime.
- Valores exatos de debounce/lookahead e a ordem fina de empate dentro do princípio de gravidade do D-03.
- O predicado exato de "encurralado" (D-16), desde que simples e groundável.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Mecanismo herdado da 07.1 (a Phase 8 é a POLÍTICA sobre este canal)
- `.planning/phases/07.1-loop-agentico-percepcao-dirigida-por-consequencia/07.1-CONTEXT.md` — D-15/D-19/D-20: a 07.1 emite `hungry`/`hostileNearby`/`nightFell` mas NÃO registra resposta; a Phase 8 conecta a política. Fronteira mecanismo↔política.
- `src/cognition/trigger-bus.ts` — `TriggerBus`: 6 gatilhos com edge-detection/histerese/debounce. A Phase 8 ADICIONA gatilhos de sobrevivência (`healthCritical`/afogamento/lava/queda) e generaliza o consumo.
- `src/cognition/nodes.ts` (`execute` ~linha 256-330) — AbortController por skill-run; hoje só `onHostileNearby` preempta. Ponto onde a Phase 8 generaliza a preempção para todos os gatilhos `lifeCritical`. Usar `setGoal(null)`, não `stop()` (D-07).
- `src/cognition/loop.ts` — driver externo: TriggerBus instanciado por sessão (~linha 75-81), timers autônomos. O System 1 (função pura) é chamado AQUI, fora do grafo.

### Skills e grounding (as skills reflexas seguem este contrato)
- `src/skills/index.ts` — `skillRegistry`/`SkillFunction` (`(bot,params)⇒Promise<SkillResult>`, com `AbortSignal` opcional). As skills reflexas (eat/flee/shelter) entram aqui.
- `src/skills/navigate.ts`, `src/skills/dig.ts` — padrão de skill grounded que honra abort via `pathfinder.stop()`; base para as primitivas de fuga/abrigo (mas preempção reflexa usa `setGoal(null)` — D-07).
- `src/skills/attack.ts` — stub reusado pelo "revidar se encurralado" (D-15), 1-shot sem perseguir.
- `src/skills/executor.ts` — `executeWithSafety` + bounds do 999.1 (searchRadius/thinkTimeout/pré-check) que toda nova navegação reflexa herda (D-06).
- `src/grounding/types.ts` — `SkillResult`/`SkillOutcome`; os reflexos produzem este contrato (D-10/D-19).

### Percepção e config (limiares/sensores)
- `src/perception/snapshot.ts`, `src/perception/types.ts` — `EntityInfo.kind` ('Hostile mobs') já existe (07.1); base da classificação de mob por tipo (D-13). `bot.food`/`bot.health`/`isDay` disponíveis.
- `src/config.ts` — defaults a alterar/adicionar: `hungryThreshold` (~146, 6→16), `survivalCriticalThreshold` (~89, 0.3→0.5), `hostileRadius` (~142), `hostileDebounceMs` (~144); novos limiares de afogamento/queda/lava entram aqui.

### Decisões prévias / requisitos
- `.planning/ROADMAP.md` (Phase 8, ~linha 92-103) — Goal + 5 success criteria (inclui re-teste do `[reflect]` e herança dos bounds do 999.1).
- `.planning/REQUIREMENTS.md` — SURV-01..05 (texto canônico dos requisitos).
- `.planning/STATE.md` — Accumulated Context: "System 1 = função pura no driver, fora do StateGraph" (travada, D-01); concern "re-testar `[reflect]` AO VIVO após o System 1" (D-20).
- `.planning/phases/07-grounding-skillresult/07-CONTEXT.md` — contrato do `SkillResult`/MemEvent grounded que os reflexos consomem (D-19).

### Mecânicas externas (âncoras dos limiares — D-11..D-14)
- Minecraft Wiki — Hunger (regen para em food≤17; dano em food=0): https://minecraft.wiki/w/Hunger
- Minecraft Wiki — Damage (queda = blocos−3; afogamento 2 dano/s): https://minecraft.wiki/w/Damage
- Minecraft Wiki — Creeper (fuse a 3 blocos, explosão ~7): https://minecraft.wiki/w/Creeper
- mineflayer API (consume/equip/activateItem/blockAt/oxygenLevel/setControlState): https://github.com/PrismarineJS/mineflayer/blob/master/docs/api.md
- mineflayer-pathfinder goals.js (`GoalInvert`/`GoalFollow`; ausência de `GoalRunAway`; `setGoal(null)` forçado vs `stop()` gracioso): https://github.com/PrismarineJS/mineflayer-pathfinder/blob/master/lib/goals.js
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TriggerBus` (07.1) — canal de gatilhos com edge-detection pronto; a Phase 8 adiciona gatilhos `lifeCritical` e a função de arbitragem que os consome.
- AbortController no `execute` (nodes.ts) — preempção física já funcional para `hostileNearby`; generalizar para todos os gatilhos vida-crítica via `setGoal(null)`.
- Padrão de skill grounded (`SkillFunction ⇒ Promise<SkillResult>` + `executeWithSafety` + bounds 999.1) — molde direto para eat/flee/shelter.
- `EntityInfo.kind` e `bot.food`/`bot.health`/`bot.oxygenLevel`/`bot.time` — sensores nativos prontos para os limiares.
- skill `attack` (stub) — reusada pelo revidar-se-encurralado, sem código de combate novo.

### Established Patterns
- Driver externo single-flight + grafo finito-por-tick + holder como fonte única — mantidos; o System 1 é função pura chamada no driver.
- Memória de ação derivada do `SkillResult` observado (Fase 7) — os reflexos entram pelo MESMO pipeline (D-19).
- Edge-detection com histerese (cruzar limiar, debounce) — padrão dos novos gatilhos de sobrevivência (D-11..D-14).

### Integration Points
- Função de arbitragem do System 1 chamada no driver (`loop.ts`), ao lado do TriggerBus.
- Generalização da preempção no `execute` (nodes.ts): listener por gatilho `lifeCritical` → `skillAbort.abort()`.
- Novos gatilhos no `trigger-bus.ts`: `healthCritical`, afogamento, lava-à-frente, queda-iminente.
- Novas skills reflexas em `src/skills/` registradas no `skillRegistry`.
- Novos limiares/flips em `config.ts`.
</code_context>

<specifics>
## Specific Ideas

- Arbitragem como **função pura testável por tabela-verdade** (gravidade → reflexo vencedor) é prioridade de "design limpo e instrutivo" do projeto.
- Preempção reflexa via `setGoal(null)` (forçado) e não `stop()` (gracioso) — diferença de latência decisiva para "sub-segundo".
- Comer ancorado no limiar real de regen (food≤17) em vez do default de sprint (6) — números não-arbitrários, derivados da mecânica do jogo.
- Creeper tratado a 10 blocos (antes do alcance da explosão ~7 e do fuse a 3) — distância por classe de mob, não raio único.
- O reflexo "revidar se encurralado" é estritamente **1 golpe sem perseguir** — uma linha clara para não invadir a Fase 13.
</specifics>

<deferred>
## Deferred Ideas

- **`commitmentCondition` (arbitration graph, A2)** — só adotar sobre o A1 se o flapping de borda persistir ao vivo (D-04).
- **Utility/argmax (A3)** e **Behavior Tree (A4)** para arbitragem — rejeitados aqui; BT reconsiderável nas Fases 9/12/13 (sequências ricas de building/combate).
- **`placeBlock` robusto definitivo** — Fase 9 (aqui só placeBlock mínimo de emergência).
- **Combate real** (manter alvo, recuar, kiting, threat-scoring flee-vs-fight) — Fase 13 (aqui só fuga + 1 golpe defensivo).
- **Abrigo planejado/proativo** — Fase 12 building (aqui só abrigo de emergência reativo, D-17).
- **Re-teste AO VIVO do `[reflect]`** — gate de verificação desta fase (D-20), já registrado como concern no STATE.md.

None reviewed-but-deferred todos (a busca de todos para a fase retornou 0).
</deferred>

---

*Phase: 08-system-1-sobreviv-ncia-reflexa*
*Context gathered: 2026-06-20*
