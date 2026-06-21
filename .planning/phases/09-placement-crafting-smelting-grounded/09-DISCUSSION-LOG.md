# Phase 9: Placement + Crafting/Smelting Grounded - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-21
**Phase:** 09-placement-crafting-smelting-grounded
**Mode:** advisor (USER-PROFILE presente; vendor_philosophy=conservative → full_maturity, 3-5 opções/área)
**Areas discussed:** placeBlock + shelter, Fundição sem travar, Bancada/fornalha (colocar vs reusar), Craft + equip (granularidade)

---

## placeBlock robusto + refator do shelter

| Option | Description | Selected |
|--------|-------------|----------|
| A. Wrapper grounded + swallow seletivo (`did not fire` vs falha real) + verificação `blockAt` | Trata o falso-negativo; outcome = delta real; zero listener manual | ✓ (núcleo) |
| B. A + retry curto (2-3, re-lookAt/re-equip, idempotente) | Robusto p/ building encadeado e pilar 1×1 | ✓ (atrás de flag) |
| C. Helper `getRefAndFace` (vizinho sólido c/ face exposta) | Fecha "face exposta correta"; puro/testável; ortogonal | ✓ (núcleo) |
| D. Patch interno do `place_block.js` | Acopla a internals 0.x instáveis; contra perfil conservador | |
| E. Não refatorar shelter agora | Viola "placeBlock UMA VEZ compartilhado"; deixa 2 caminhos | |

**User's choice:** "A+C, retry(B) opcional, refatora shelter" → A+C núcleo, retry(B) atrás de flag, refator do shelter.ts agora em commit isolado.
**Notes:** O erro `"Event blockUpdate did not fire"` é falso-negativo em server com lag (bloco colocado, confirmação atrasada). mineflayer já usa `onceWithCleanup` — wrapper não adiciona listeners próprios. placeBlock não equipa o item sozinho.

---

## Fundição (smelt) sem travar

| Option | Description | Selected |
|--------|-------------|----------|
| A. Bloqueante full-cycle | Grounding trivial, mas prende a skill-slot ~10s+/item | |
| C. Híbrido: poll cooperativo abortável + revisita | Preemptável por construção; caminho longo precisa de POI | |
| D. Loop cede entre itens (sem POI; pendência = input na fornalha) | Sem estado persistente novo; preempção entre itens; ~10s não-preemptável durante o item | ✓ |
| B. Fire-and-forget + POI/pendência | Nunca bloqueia, mas subsistema novo de POI/expiração | |

**User's choice:** "D: loop cede entre itens (sem POI)".
**Notes:** Combustível por densidade (charcoal→coal→planks). Esperar via evento `'update'` + timeout/abort. Verdade = `outputItem()`/`takeOutput()`, nunca `progress`. `furnace.close()` obrigatório no fim e no abort (1 window por vez). Trade-off aceito: ~10s não-preemptável por item individual.

---

## Estação (bancada/fornalha): descobrir-vs-colocar

| Option | Description | Selected |
|--------|-------------|----------|
| (a) Sempre colocar a própria | Estado simples, mas gasta recurso + clutter + ignora POI | |
| (b) Buscar→reusar, place se não achar (sem POI) | Economiza recurso, mas Fase 10 varre o mundo de novo | |
| (c) Buscar→reusar→registrar POI 'station' | + Fase 10 reusa via `nearbyPlaces`; POI = cache (re-valida findBlock) | ✓ |
| (d) Place-and-pickup | Zero clutter, mas quebra reuso da Fase 10 + mais passos | |

**User's choice:** "(c) Buscar→reusar→registrar POI 'station'".
**Notes:** Raio = `gatherSearchRadius` (16); fallback `placeBlock` se null/inacessível; deixa plantada; adiciona `'station'` ao union `PlaceType`. `bot.craft`/`openFurnace` exigem o Block real ao alcance (bot adjacente).

---

## Craft + equip (granularidade)

### (A) Granularidade do craft
| Option | Description | Selected |
|--------|-------------|----------|
| A1. `craft(itemName, count)` resolve receita por nome | Contrato serializável p/ LLM; 2x2→bancada→no_effect; Fase 10 adiciona recursão atrás do mesmo nome | ✓ |
| A2. `craft(recipe)` pré-resolvida | `Recipe` não serializa em Zod/LLM — inviável aqui | |
| A3. Híbrido c/ override | YAGNI; param morto até Fase 10 | |

### (B) equip
| Option | Description | Selected |
|--------|-------------|----------|
| B1. `equip(item)` standalone | Verbo 1ª-classe que CRAFT-04 nomeia | ✓ |
| B2. Pré-flight em dig/attack | Rede de segurança p/ LLM local que esquece de equipar | ✓ |
| B3. só standalone | LLM frágil esquece → dig/attack de mão vazia | |
| B4. só pré-flight | Sem verbo equip explícito p/ armadura | |

**User's choice:** "A1 (craft por nome) + B1+B2 equip".
**Notes:** Escopo do "apropriado" = heurística binária por categoria (qualquer pickaxe/sword/axe), SEM ranking por tier (tier = Fase 10). Grounding: craft por delta de inventário; equip por heldItem/slot de armadura (local, delta:{}).

---

## Claude's Discretion

- Nomes de arquivos/helpers (`placeBlock.ts`, `ensureStation`, `getRefAndFace`, `selectToolFor`), schemas Zod, timeouts, nº de tentativas do retry, predicado de "face exposta/alcançável", mecânica da espera do `'update'`, sinal de "continuar fundindo", heurística de `matchesCategory`.

## Deferred Ideas

- Revisita/POI persistente p/ smelting de lotes grandes (Opção B) — diferida.
- Retry sempre-ligado no placeBlock — atrás de flag por ora.
- Seleção de ferramenta por tier; resolução recursiva de receitas / tech-tree DAG — Fase 10.
- Place-and-pickup de estação; building deliberado — Fases 10/12.

## Extra Q&A (esclarecimentos do usuário antes de gravar)

- "me explica como vai funcionar" → explicado o fluxo ponta a ponta de cada skill (placeBlock wrapper, craft por nome + ensureStation, smelt por item, equip B1+B2) e a cadeia tronco→ferro.
- "o LLM vai ser de tudo certo ponta a ponta?" → esclarecido que NÃO se depende do LLM fraco: grounding (Fase 7) impede mentira, skills determinísticas blindam a mecânica, DAG (Fase 10) monta a sequência. LLM = diretor criativo; código = engenheiro de precisão.
