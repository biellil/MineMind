# Stack Research

**Domain:** v2.0 "Autonomia de Verdade" — adições de stack para sobrevivência, combate, building, progressão/tech-tree e provider LLM configurável (GPT + LM Studio) num agente Minecraft TS já existente
**Researched:** 2026-06-19
**Confidence:** HIGH (versões verificadas no npm registry; APIs nativas confirmadas na doc oficial do Mineflayer; modelos OpenAI confirmados na doc OpenAI 2026)

## Executive Verdict (leia primeiro)

**A maior parte do v2.0 NÃO precisa de bibliotecas novas — precisa usar a API nativa do Mineflayer.** Crafting, smelting, colocar blocos, equipar armadura/ferramenta, atacar e comer já são métodos do objeto `bot` (`recipesFor`/`craft`, `placeBlock`, `equip`, `openFurnace`, `attack`, `consume`). Para um projeto de pesquisa cujo valor é código limpo e instrutivo, escrever esses comportamentos sobre a API nativa é mais didático e mais robusto que depender de plugins de combate/auto-eat que estão **4 anos sem atualização**.

**Adições recomendadas (mínimas):** apenas **`mineflayer-tool@1.2.0`** (auto-equipar a melhor ferramenta antes de minerar — e agora é peer-dependency obrigatória do `mineflayer-collectblock@1.6.0` que vocês já têm) e, opcionalmente, **`mineflayer-armor-manager@2.0.1`** (auto-equipar a melhor armadura, ganho de sobrevivência barato). **Não adicionar** `mineflayer-pvp` nem `mineflayer-auto-eat` — escreva combate e alimentação sobre a API nativa (ver "What NOT to Use").

**Provider LLM:** a abstração já existe (`@langchain/openai` apontando `baseURL` para LM Studio). Para o GPT cloud, é o **mesmo `ChatOpenAI`** apontando para o endpoint padrão da OpenAI com `apiKey` real e `model: "gpt-5.4"` (ou `gpt-5.5` quando precisar de reasoning forte). Zero biblioteca nova — só configuração trocável por env. Cuidado de custo num loop sempre-ativo é a parte crítica (ver seção dedicada).

**Discrepância importante com o STACK do v1.0:** o `package.json` real do projeto já está em **LangChain 1.x** (`@langchain/core ^1.2.0`, `@langchain/langgraph ^1.4.4`, `@langchain/openai 1.5.1`) e **`mineflayer-collectblock 1.6.0`** — não nos 0.4.x/1.4.4 que o STACK v1.0 documentou. A pesquisa abaixo trata o estado real instalado.

## Recommended Stack

### Core Technologies (já presentes — referência, não reinstalar)

| Technology | Version (instalada) | Purpose | Nota para v2.0 |
|------------|---------------------|---------|----------------|
| mineflayer | 4.37.1 | Interface do jogo + **API nativa de craft/place/equip/attack/consume/furnace** | Toda a base de sobrevivência/combate/building/progressão sai daqui. Suporta MC 1.8–1.21.11 (vocês rodam 1.21.4). HIGH |
| mineflayer-pathfinder | 2.4.5 | Navegação A* | Reusado por combate (chegar no alvo), building (chegar no ponto), gathering. HIGH |
| mineflayer-collectblock | **1.6.0** | "Coletar bloco X" | **Já atualizado de 1.4.4 → 1.6.0.** A 1.6.0 declara `mineflayer-tool ^1.1.0` como **peerDependency** — ver Supporting Libraries. HIGH |
| @langchain/langgraph | **1.4.4** | StateGraph do loop cognitivo | Já em 1.x (não 0.4.x). Mantido. HIGH |
| @langchain/core | **1.2.0** | Abstrações core | Peer de langgraph/openai. HIGH |
| @langchain/openai | **1.5.1** | Cliente `ChatOpenAI` | **Este é o ponto de extensão do provider:** mesma classe serve LM Studio (baseURL local) e GPT cloud (baseURL padrão + apiKey). HIGH |
| zod | 4.4.3 | Structured output | Reusado para schemas de plano/decisão/ação. Atenção ao caveat zod v4 ↔ `withStructuredOutput` (ver Version Compatibility). HIGH |

### Supporting Libraries (adições do v2.0)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| mineflayer-tool | **1.2.0** | Auto-equipar a **melhor ferramenta** para um bloco/dig (`bot.tool.equipForBlock`) | **ADICIONAR — quase obrigatória.** É peerDependency do collectblock@1.6.0 que já está instalado; instalar explicitamente evita falha de peer e habilita "minerar com a ferramenta certa" na progressão (picareta de pedra → ferro → diamante). peerDeps: `mineflayer ^4.0.0`, `mineflayer-pathfinder ^2.1.1`, `prismarine-nbt ^2.0.0` (todos já satisfeitos). HIGH |
| mineflayer-armor-manager | **2.0.1** | Auto-equipar a **melhor armadura** disponível no inventário (`bot.armorManager.equipAll()`) | **ADICIONAR (opcional, sobrevivência barata).** peerDep `mineflayer ^4.10.0` (satisfeito). Ganho de "não morrer" com ~1 linha; sem isso, equipar armadura é `bot.equip(item, 'head'|'torso'|'legs'|'feet')` manual via API nativa. 4 anos sem release, mas a superfície é trivial e estável. MEDIUM |
| prismarine-recipe | 1.5.0 (transitiva) | Modelo de receitas que alimenta `bot.recipesFor` | Já vem via mineflayer; útil conhecer se for inspecionar/explicar dependências de craft na tech tree. HIGH |
| minecraft-data | 3.111.0 (transitiva) | Dados de itens/blocos/receitas por versão | Já vem via mineflayer; fonte de verdade para "o que craftar e com o quê" ao montar a tech tree de forma data-driven. HIGH |

### API Nativa do Mineflayer — o que cada feature do v2.0 usa (sem plugin)

| Feature v2.0 | API nativa | Assinatura / nota |
|--------------|-----------|-------------------|
| **Progressão/craft** | `bot.recipesFor(itemType, metadata, minResultCount, craftingTable)`, `bot.recipesAll(...)`, `bot.craft(recipe, count, craftingTable?)` (Promise) | `recipesFor` retorna receitas viáveis com o inventário atual; passar `craftingTable` (o `Block`) habilita receitas 3x3. Autocraft = você resolve a cadeia de dependências (madeira→tábuas→bancada→picareta) chamando `recipesFor` recursivamente. **Não há "autocraft" mágico nativo.** HIGH |
| **Smelting** | `bot.openFurnace(furnaceBlock)` → `Furnace` (`.putInput`, `.putFuel`, `.takeOutput`, eventos `update`) | Fornalha é um objeto com I/O assíncrono; smelt de minério de ferro vira: posicionar fornalha (placeBlock) → openFurnace → putFuel(carvão) → putInput(minério) → aguardar → takeOutput. HIGH |
| **Building** | `bot.placeBlock(referenceBlock, faceVector)`, `bot.equip(blockItem, 'hand')` | Coloca bloco na face indicada de um bloco de referência; precisa do item equipado na mão e de uma face exposta. Construir abrigo = sequência de placeBlock com pathfinder posicionando o bot. HIGH |
| **Combate** | `bot.attack(entity, swing=true)`, `bot.equip(weapon, 'hand')`, pathfinder p/ aproximar/recuar | Ataque é 1 chamada; o "estado de combate real" (mirar, manter alcance, cooldown de ataque ~0.6s, trocar de arma) você orquestra no loop. HIGH |
| **Sobrevivência / comida** | `bot.food`, `bot.foodSaturation`, `bot.consume()` (Promise), `bot.equip(food, 'hand')` | Loop: se `bot.food < limiar` e tem comida → equipar comida → `consume()`. Trivial sem plugin. HIGH |
| **Sobrevivência / vida + mobs** | `bot.health`, eventos `health`, `entityHurt(entity)`, `death`, `entitySpawn(entity)`, `bot.nearestEntity()` / `bot.entities` | Detecção de mob hostil = filtrar `bot.entities` por tipo/kind (`type === 'hostile'` / `mobType`) e distância; fuga = pathfinder goal "longe do mob"; defesa = `attack`. HIGH |
| **Equipar armadura/ferramenta** | `bot.equip(item, destination)` onde destination ∈ `head|torso|legs|feet|hand|off-hand` | Base nativa; os plugins tool/armor-manager só automatizam a *escolha* do melhor item. HIGH |

### Development Tools (sem mudança)

| Tool | Purpose | Notes |
|------|---------|-------|
| Bun 1.3.x | Runtime + package manager + test runner | Crafting/place/attack são lógica JS pura sobre o `bot` — sem novos addons nativos, então **continua 100% compatível com Bun**. Nenhuma das adições (tool/armor-manager) traz node-gyp. HIGH |
| LM Studio | Host LLM local | Mantido como provider default custo-zero do loop sempre-ativo. |

## Installation

```bash
# Adição quase-obrigatória (peer do collectblock@1.6.0 + ferramenta certa p/ tech tree)
bun add mineflayer-tool@1.2.0

# Opcional — sobrevivência barata (auto-equipar melhor armadura)
bun add mineflayer-armor-manager@2.0.1

# NADA a instalar para: crafting, smelting, building, combate, comida,
# detecção de mobs, provider GPT — tudo é API nativa do mineflayer / ChatOpenAI já presente.
```

## Provider LLM configurável: GPT cloud + LM Studio local

A abstração correta **já está no projeto** (`@langchain/openai@1.5.1`). Os dois providers são a **mesma classe `ChatOpenAI`**, divergindo só em config:

```ts
// LM Studio (local, default custo-zero do loop)
new ChatOpenAI({
  model: "qwen3-vl-8b",            // modelo carregado no LM Studio
  apiKey: "lm-studio",             // dummy
  configuration: { baseURL: "http://localhost:1234/v1" },
});

// OpenAI cloud (reasoning forte sob demanda)
new ChatOpenAI({
  model: "gpt-5.4",                // ver tabela de modelos abaixo
  apiKey: process.env.OPENAI_API_KEY,
  // sem baseURL → endpoint padrão da OpenAI
});
```

Trocar por env (`LLM_PROVIDER=local|openai`, `OPENAI_MODEL=...`) numa factory que devolve o `ChatOpenAI` configurado. Structured output (`.withStructuredOutput(zodSchema, { strict: true })`) e tool-calling funcionam **igual** nos dois — com a ressalva de que modelos locais fracos derivam mais (por isso `strict`/zod ajudam), enquanto GPT-5.x honra strict JSON Schema nativamente.

### Modelos GPT recomendados (OpenAI API, jun/2026)

| Modelo | Input / Output ($/1M tok) | Quando usar no MineMind |
|--------|---------------------------|--------------------------|
| **gpt-5.4** | ~$2.50 / $15 | **Recomendado default cloud.** Reasoning forte para planejamento de tech-tree/decisões, com `reasoning.effort: "low"` (suficiente p/ a maioria) → reduz tokens de raciocínio e custo. Suporta Structured Outputs + tool-calling + prompt caching (-90% em input cacheado). HIGH |
| gpt-5.5 | ~$5 / $30 | Só quando 5.4 falhar em raciocínio multi-step difícil. É o frontier (abr/2026); caro demais p/ rodar em loop. MEDIUM |
| o4-mini | ~$0.55 / $2.20 | Alternativa de reasoning barata se quiser modelo de raciocínio dedicado custo-baixo. MEDIUM |
| gpt-4.1-nano | ~$0.10 / $0.40 | Mais barato da casa; para sub-tarefas triviais (classificar intenção de chat, resumir evento) onde reasoning forte é desperdício. MEDIUM |

> **Recomendação:** default **gpt-5.4 com `reasoning.effort: "low"`** para o ciclo cognitivo, e considerar **gpt-4.1-nano** para chamadas auxiliares baratas (chat/resumo). Reservar gpt-5.5 para troubleshooting de decisões difíceis.

### Cuidados de CUSTO num loop sempre-ativo (crítico)

- **O loop é o multiplicador.** Um tick a cada poucos segundos × tokens de prompt grande (estado do mundo + memória) × 24/7 explode custo no cloud. LM Studio local deve continuar o **default**; GPT é opt-in.
- **Prompt caching:** GPT-5.x dá -90% no input cacheado. Mantenha system prompt + persona + esquema estáveis no início do prompt para maximizar cache hit.
- **`reasoning.effort: "low"` (ou `minimal`)** corta tokens de raciocínio invisíveis (que são cobrados como output) — o maior dreno de custo em modelos de reasoning num loop.
- **Gate de invocação:** não chame o LLM todo tick. Manter o arbiter reativo/heurístico para a maioria dos ticks e só acionar o LLM (local ou cloud) em mudança de situação/decisão — alinha com o single-flight já existente.
- **Batching/verbosity baixa:** limitar `max_tokens` de saída e verbosity; o plano não precisa ser prosa.
- Considerar **roteamento por dificuldade:** local p/ rotina, cloud só quando a confiança/heurística indicar decisão importante.

## Alternatives Considered

| Recomendado | Alternativa | Quando usar a alternativa |
|-------------|-------------|---------------------------|
| API nativa `bot.attack` + pathfinder p/ combate | mineflayer-pvp@1.3.2 | Se quiser strafing/cooldown prontos e aceitar dependência 4 anos parada. Para pesquisa/clareza, escrever no loop é melhor (você controla o estado de combate explicitamente). |
| API nativa `bot.food`/`consume` p/ comida | mineflayer-auto-eat@5.0.3 | Se quiser auto-eat configurável (startOnHunger, priority, bannedFood) pronto. Custo: puxa `@nxg-org/mineflayer-util-plugin` (dep extra de terceiro) — overkill p/ "comer quando com fome". |
| mineflayer-armor-manager (opcional) | `bot.equip` manual por slot | Se preferir zero deps novas: escolher a melhor armadura você mesmo via minecraft-data e equipar por slot. |
| gpt-5.4 (cloud) | gpt-5.5 / o4-mini / gpt-4.1-nano | Ver tabela de modelos — por dificuldade da tarefa e orçamento. |
| ChatOpenAI → OpenAI cloud | SDK `openai` puro / Ollama | SDK puro perde a abstração unificada do LangGraph. Ollama é outro host local OpenAI-compatível (mesmo `baseURL` swap) se largar LM Studio. |

## What NOT to Use

| Evitar | Por quê | Usar em vez disso |
|--------|---------|-------------------|
| **mineflayer-pvp@1.3.2** | Última publicação **jul/2022** (4 anos); puxa `mineflayer-utils@^0.1.4` (também abandonado); combate PVE é simples sobre `bot.attack` + pathfinder. Risco de bug silencioso contra MC 1.21.4. | API nativa: `bot.attack(entity)`, equipar arma com `bot.equip`, alcance/cooldown no seu loop. |
| **mineflayer-auto-eat@5.0.3** | Funciona, mas adiciona dependência de terceiro (`@nxg-org/mineflayer-util-plugin`) para algo trivial; menos didático num projeto de pesquisa. | `if (bot.food < N) { equip(food,'hand'); await bot.consume(); }`. |
| Reescrever crafting/place/equip com lib externa | A API nativa já cobre tudo; libs "autocraft" abandonadas escondem a lógica de dependência que é justamente o objeto de estudo (tech tree). | `bot.recipesFor`/`bot.craft` + resolução recursiva de receitas via minecraft-data. |
| gpt-5.5 como modelo do loop | $5/$30 por 1M tok rodando 24/7 = custo proibitivo; reasoning sobra para sobreviver/craftar. | gpt-5.4 `effort:low` como cloud default; LM Studio local como default geral. |
| Chamar LLM cloud todo tick | Loop sempre-ativo × prompt grande × 24/7 = fatura explode. | Gate heurístico + single-flight; cloud só em decisão relevante. |
| `prismarine-viewer` para "ver" o combate/building | Debug-only, build nativo pesado (node-canvas-webgl), quebra Bun. | Logar estado do `bot` (entities/blocks) — já é texto estruturado p/ o LLM. |

## Stack Patterns by Variant

**Se priorizar clareza de pesquisa / mínimo de deps (recomendado):**
- Só `mineflayer-tool` (peer obrigatória do collectblock); combate, comida e building na API nativa.
- Provider: LM Studio default, GPT-5.4 opt-in por env.
- Tudo roda em Bun sem addon nativo novo.

**Se quiser sobrevivência "turbinada" com menos código:**
- Adicionar `mineflayer-armor-manager` (auto-armor) além do `mineflayer-tool`.
- Ainda escrever combate/comida na API nativa (os plugins desses dois são os fracos/abandonados).

**Se reasoning local não der conta da autonomia:**
- Subir o gate cloud: rotina local, decisões de tech-tree/planejamento em gpt-5.4. Vigiar custo com caching + effort:low.

## Version Compatibility

| Package A | Compatível com | Notas |
|-----------|----------------|-------|
| mineflayer-collectblock@1.6.0 | mineflayer ^4.0.0, mineflayer-pathfinder ^2.1.1, **mineflayer-tool ^1.1.0** | A 1.6.0 (vs 1.4.4 do v1.0) **exige mineflayer-tool como peer** — instalar explicitamente. HIGH |
| mineflayer-tool@1.2.0 | mineflayer ^4.0.0, mineflayer-pathfinder ^2.1.1, prismarine-nbt ^2.0.0 | Peers já satisfeitos pelo stack atual. HIGH |
| mineflayer-armor-manager@2.0.1 | mineflayer ^4.10.0 | Satisfeito (4.37.1). Sem addon nativo → OK no Bun. MEDIUM (4 anos sem release, superfície trivial). |
| mineflayer@4.37.1 | MC 1.8–1.21.11 | Servidor em 1.21.4 está dentro do range. APIs craft/place/attack/furnace estáveis nessa faixa. HIGH |
| @langchain/openai@1.5.1 | LM Studio `/v1` **e** OpenAI cloud | Mesma `ChatOpenAI`; só muda baseURL/apiKey/model. HIGH |
| @langchain/openai@1.5.1 + zod@4.4.3 | `.withStructuredOutput(schema, {strict})` | **Caveat:** houve issues de compat zod v4 ↔ `withStructuredOutput` no langchainjs (issue #8357). Em 1.x já há suporte, mas **validar ao vivo** que o schema zod 4 é aceito; fallback é converter via `zodToJsonSchema` e passar JSON Schema cru. MEDIUM |
| gpt-5.4 / gpt-5.5 | Structured Outputs + tool-calling + `reasoning.effort` | Suportado nativamente; `effort: low|minimal` controla custo. HIGH |
| Bun 1.3.x | adições tool/armor-manager | Lógica JS pura, sem node-gyp → compatível. HIGH |

## Sources

- npm registry (consultado 2026-06-19) — mineflayer 4.37.1, mineflayer-pathfinder 2.4.5, **mineflayer-collectblock 1.6.0** (peer mineflayer-tool ^1.1.0), **mineflayer-tool 1.2.0**, mineflayer-armor-manager 2.0.1 (peer mineflayer ^4.10.0), mineflayer-pvp 1.3.2 (modified 2022-07-03), mineflayer-auto-eat 5.0.3, prismarine-recipe 1.5.0, minecraft-data 3.111.0, **@langchain/core 1.2.0, @langchain/langgraph 1.4.4, @langchain/openai 1.5.1** — HIGH
- `package.json` do projeto (lido 2026-06-19) — confirma LangChain 1.x e collectblock 1.6.0 já instalados (divergência do STACK v1.0) — HIGH
- https://github.com/PrismarineJS/mineflayer/blob/master/docs/api.md — assinaturas nativas: `recipesFor/recipesAll/craft`, `placeBlock`, `equip/unequip`, `attack`, `activateBlock/openFurnace`, `consume`, props `health/food/foodSaturation`, eventos `entityHurt/death/health/entitySpawn` — HIGH
- https://github.com/PrismarineJS/mineflayer-pvp — `bot.pvp.attack/stop`; última release 2022 (abandonado) — HIGH
- https://developers.openai.com/api/docs/models/gpt-5.4 + /gpt-5.5 + https://developers.openai.com/api/docs/guides/latest-model — modelos jun/2026, `reasoning.effort` (low/medium/high/xhigh), Structured Outputs, prompt caching — HIGH
- https://www.aipricing.guru/openai-pricing/ + https://pricepertoken.com/pricing-page/model/openai-gpt-5.4 — preços aprox. gpt-5.5 $5/$30, gpt-5.4 $2.50/$15, o4-mini $0.55/$2.20, gpt-4.1-nano $0.10/$0.40 — MEDIUM (agregadores de preço; ordem de grandeza confiável)
- https://docs.langchain.com/oss/javascript/integrations/chat/openai + https://github.com/langchain-ai/langchainjs/issues/8357 — `withStructuredOutput`/`bindTools` com `strict`; caveat de compat zod v4 — MEDIUM

---
*Stack research for: MineMind v2.0 (sobrevivência/combate/building/tech-tree + provider GPT configurável) sobre stack TS/Mineflayer/LangGraph existente*
*Researched: 2026-06-19*
