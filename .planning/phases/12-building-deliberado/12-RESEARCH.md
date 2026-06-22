# Phase 12: Building Deliberado - Research

**Researched:** 2026-06-22
**Domain:** Autonomous deliberate building in Minecraft (TypeScript / Mineflayer 4.37.1 / LangGraph) — generic idempotent block-series builder on top of the proven Phase 9 `placeBlockSafe` primitive
**Confidence:** HIGH (the phase reuses internal primitives whose exact signatures were read from source; the only external dependency — mineflayer-builder ordering — was verified against the upstream repo)

## Summary

Phase 12 is almost entirely an **orchestration-over-existing-primitives** phase, not a new-mechanics phase. The hard problems (the `blockUpdate` false-negative, the grounding-from-world convention, the `getRefAndFace` reach computation, the anti-lava guard, pathfinder bounds, pacing/abort) were all solved in Phases 7–9. The builder is a **loop over `placeBlockSafe`** with three additions wired ON for the first time: (1) the **retry body** for the reserved `config.placeRetries`, (2) a **deterministic placement-ordering** pass, and (3) **deterministic blueprint generators** that turn `{tipo, dims, origin}` into a `{pos, bloco}[]` list. Everything else is reuse.

The integration is a **separate path** alongside the existing Phase 9 G-01 verb dispatch (`building` state aggregating craft/smelt/equip/place) and the Phase 10 DAG router. The cleanest seam is to add a `build:` prefix to the deterministic goal-prefix router that already exists in `nodes.ts` (`DAG_PREFIXES` + `goalToSkillParams`), mirroring it exactly. Autonomous activation comes from a shelter need (today a stub need) plus the existing `player_request` goal channel. Closure validation reuses the exact `blockAt`-neighbor pattern already in `shelter.ts`.

**Primary recommendation:** Build `src/skills/builder.ts` (generic blueprint executor: equip-select → ordered loop → per-block `getRefAndFace`+`placeBlockSafe`+idempotency-skip+retry → `gaussianDelay`+`AbortSignal` between blocks → coverage-grounded `SkillResult`) plus `src/skills/blueprints.ts` (pure `{tipo,dims,origin} → {pos,bloco}[]` generators). Register a single `build` skill in `skillRegistry`, route it via a new `build:` prefix that mirrors `goalToSkillParams`, activate it from a shelter need + the existing player-request channel, and remove `'building'` from `STUB_STATES`. Do NOT touch the Phase 9 G-01 verb dispatch, the Phase 8 reflex `shelter.ts`, or the Phase 10 DAG router behavior.

<user_constraints>
## User Constraints (from CONTEXT.md)

The CONTEXT.md encodes decisions as `D-01..D-16` under `<decisions>`, plus a `### Claude's Discretion` block and a `<deferred>` block. Reproduced verbatim below. **The planner MUST honor every locked D-decision and MUST NOT plan anything in Deferred Ideas.**

### Locked Decisions (D-01..D-16)

**Builder genérico — place em série (BUILD-02, BUILD-03)**
- **D-01:** Builder genérico idempotente que recebe um blueprint (lista de `{pos, bloco}`) e o executa numa skill-run: para cada alvo → `getRefAndFace` → `placeBlockSafe` → verifica por `blockAt`. **`gaussianDelay` + checagem de `AbortSignal` ENTRE cada bloco** — preemptável sem a lentidão de 1-bloco-por-tick. Espelha o padrão "smelt re-roda entre itens" (Fase 9 / D-06): cada bloco é um ponto de cedência natural ao System 1.
- **D-02:** LIGAR `placeRetries` (campo reservado na Fase 9 / D-04): 2–3 tentativas idempotentes por bloco (re-`lookAt` / re-`equip`; nunca recolocar se o alvo já está preenchido), para o race do `blockUpdate` que o building encadeado expõe mais.
- **D-03:** Retomada natural por idempotência: re-rodar o blueprint pula posições já preenchidas (`isFilled`); `outcome = success` só com cobertura total da casca, senão `partial`. Build interrompido por preempção é retomado re-selecionando o goal `build:*` — sem subsistema de pendência persistente.
- **D-04:** Rede de segurança do builder: cada alvo passa por `getRefAndFace`; sem face alcançável OU já preenchido → pula o alvo. Uma lista ruim NUNCA soterra o bot nem lança (Core Value) — degrada para `partial`/`no_effect`, reusando o grounding da Fase 9 (verdade = `blockAt`).
- **D-05:** Ordem de colocação determinística que preserva *reach* e não auto-soterra (baixo→cima, fora→dentro; o bloco da própria célula do bot por último, ou o bot se reposiciona). Algoritmo fino é Claude's discretion.

**Especificação de estruturas — blueprint híbrido**
- **D-06:** Modelo HÍBRIDO. O builder genérico (D-01) executa um blueprint venha de onde vier — gerador determinístico ou lista crua do LLM.
- **D-07:** Estruturas CONHECIDAS (abrigo, parede, torre, posicionar estação) = geradores determinísticos que produzem o blueprint a partir de `{tipo, dims, origin}`. O LLM escolhe O QUE e ONDE (tipo + dimensões + origem), não cada coordenada.
- **D-08:** Estruturas AD-HOC / criativas = o LLM fornece a lista de blocos crua (coords absolutas) e ela passa pelo mesmo builder + rede de segurança (D-04). Coords relativas à origem NÃO foram adotadas nesta fase.

**Abrigo funcional deliberado (BUILD-02)**
- **D-09:** Geometria = vedação total estendendo a mecânica do reflexo da Fase 8 (cavar-e-tampar / pilar 1×1) para fechar TODOS os lados. Produzido por gerador determinístico (D-07), NÃO por lista do LLM.
- **D-10:** Validação de "fechado de verdade": `blockAt` nos vizinhos da(s) célula(s) do bot — todos sólidos = selado. `outcome` grounded por cobertura real, nunca pela resolução da Promise.
- **D-11:** Distinto do reflexo da Fase 8: o abrigo deliberado é proativo; o reflexo de emergência (`shelter.ts`, sub-segundo, `lifeCritical`) mantém precedência e NÃO é tocado nesta fase.

**Ativação / roteamento do estado building**
- **D-12:** Building é selecionável AUTONOMAMENTE: need de abrigo/segurança E pedido direto do jogador geram um goal `build:shelter`/`build:wall`/`build:tower`/`build:station`.
- **D-13:** Roteador determinístico por prefixo de goal `build:*` espelhando o roteador DAG da Fase 10 (`goalToSkillParams` em `nodes.ts`) — sem depender do LLM conhecer a mecânica de construção.
- **D-14:** O dispatch atual do estado `building` (Fase 9 / G-01: craft/smelt/equip/place) permanece INTACTO — a construção deliberada entra por um caminho separado (goal `build:*`).
- **D-15:** O reflexo de sobrevivência da Fase 8 mantém precedência de preempção; o building deliberado NÃO preempta nada e é abandonado/retomado se um `lifeCritical` disparar (reusa a preempção generalizada do execute node).

**Bounds / pacing (SC3)**
- **D-16:** Toda navegação nova do building herda os bounds do pathfinder 999.1 (searchRadius / thinkTimeout / pré-check `getPathTo`). Pacing anti-cheat via `gaussianDelay` entre blocos (D-01). Sem OOM em soak.

### Claude's Discretion
- Nomes de arquivos/helpers (ex.: `builder.ts`, geradores de blueprint, skill `build`) e organização interna.
- Forma exata do schema Zod do `build` (`{tipo, dims, origin}` + caminho ad-hoc de lista crua), valores de `placeRetries` (2 vs 3) e do delay entre blocos.
- Algoritmo exato de ordenação de colocação (D-05) e heurística de seleção de material do inventário (preferir descartáveis cobblestone/dirt sobre úteis), reusando o `PLACEABLE`/lista do `shelter.ts`.
- Dimensões default de parede/torre e o gatilho fino do need de abrigo (limiar de noite / sem-teto).
- Mecânica de retomada do build parcial (reusar `actionFinished` / outcome `partial` como no smelt da Fase 9).

### Deferred Ideas (OUT OF SCOPE — do not plan)
- Coords RELATIVAS à origem para listas ad-hoc do LLM.
- Iluminação / tochas dentro do abrigo.
- Portas / janelas / entrada com fechamento atrás.
- Construções multi-cômodo / casas elaboradas.
- Tarefa-de-build persistente entre reinícios (retomada é por re-seleção de goal + idempotência).
- Aprendizado sobre falhas de build (Fase 14).
- Combate (Fase 13).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description (REQUIREMENTS.md) | Research Support |
|----|------------------------------|------------------|
| BUILD-02 | O agente constrói um abrigo funcional (estado `building` real, além do abrigo de emergência reflexo) | Deterministic shelter generator (D-09) + generic builder loop over `placeBlockSafe` + coverage validation via `blockAt` neighbors (the exact pattern already in `shelter.ts:113-115`). SC1 = "fecha de verdade" → grounded by real coverage. |
| BUILD-03 | O agente constrói estruturas simples (parede / torre / posicionar estação) | Deterministic `wall`/`tower` generators + reuse of `ensureStation` (`station.ts`) for `build:station`. Same builder loop, same safety net (D-04). SC2 = autonomous activation via `build:*` goal. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Commits:** Conventional Commits + emoji prefix is MANDATORY (e.g. `✨ feat(building): ...`, `✅ test(builder): ...`). NEVER include `Generated with Claude Code` / `Co-Authored-By` lines.
- **GSD workflow:** all file edits must flow through a GSD command (this phase is `/gsd:execute-phase`). No ad-hoc direct edits.
- `modelo/` read-only rule and the agent-template slash commands are from a different (unrelated) project profile and do not apply to MineMind source.

## Standard Stack

This phase adds **no new dependencies**. Everything is already in `package.json` (verified 2026-06-22):

### Core (already pinned)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| mineflayer | 4.37.1 | `bot.placeBlock`, `bot.blockAt`, `bot.equip`, `bot.dig`, `bot.lookAt` | The block-placement + world-read primitives the builder loops over. Already consumed by `placeBlockSafe`. |
| mineflayer-pathfinder | 2.4.5 | `bot.pathfinder.goto(new goals.GoalNear(...))` to reposition for reach | Already used by `ensureStation`; inherits the 999.1 bounds (`pathfinderSearchRadius`/`pathfinderThinkTimeoutMs`). |
| zod | 4.4.3 | `BuildSchema` for `{tipo, dims, origin}` + ad-hoc raw-list path | Same validation pattern as `PlaceBlockSchema`/`ShelterSchema`. Use `.toJSONSchema()` for the tool descriptor. |
| bun | (runtime) | `bun test`, `bun:sqlite` for the optional POI write | Project runtime; tests are `import { test, expect } from 'bun:test'`. |

### Supporting (internal primitives — NOT to be reimplemented)
| Internal module | Exact reusable export | Purpose in Phase 12 |
|-----------------|----------------------|---------------------|
| `src/skills/placeBlock.ts` | `placeBlockSafe(bot, ref, faceVector, blockItem, targetPos): Promise<SkillResult>`; `getRefAndFace(bot, target): {ref, face} \| null`; `isFilled` (private — re-export or duplicate the 1-line check) | The per-block core. Builder calls `getRefAndFace` then `placeBlockSafe` per target. |
| `src/skills/shelter.ts` | `PLACEABLE` regex; cavar-e-tampar / pilar mechanics; anti-lava `UNSAFE_BELOW` set | Material selection + the full-seal geometry extends this. `shelter.ts` itself stays INTACT (D-11). |
| `src/skills/station.ts` | `ensureStation(bot, type, signal): Promise<Block \| null>` | Base of `build:station`. |
| `src/skills/executor.ts` | `executeWithSafety(action, {timeoutMs, signal})`; `gaussianDelay(meanMs, stdDevMs)` | Wrap the whole build-run for timeout/abort; `gaussianDelay` between blocks (D-01). |
| `src/grounding/types.ts` | `SkillResult`, `SkillOutcome` | The builder's return contract. |
| `src/grounding/capture.ts` | `captureGroundState` (optional — coverage is read directly via `blockAt`, inventory delta is secondary) | Available if a delta is wanted; coverage grounding does not strictly need it. |

**Installation:** none. `bun install` already satisfies. No `npm install` step in any plan.

## Architecture Patterns

### Recommended file layout
```
src/skills/
├── builder.ts        # NEW: generic blueprint executor (the D-01 loop) + build skill + buildTool
├── blueprints.ts     # NEW: pure generators {tipo,dims,origin} -> {pos,bloco}[] (shelter/wall/tower)
├── placeBlock.ts     # REUSE (export isFilled if builder needs it)
├── shelter.ts        # UNTOUCHED (D-11) — only borrow PLACEABLE / material list
├── station.ts        # REUSE ensureStation for build:station
└── index.ts          # register `build` in skillRegistry + buildTool in toolRegistry
src/cognition/
├── nodes.ts          # add BUILD_PREFIXES + buildGoalToSkillParams mirroring DAG router (D-13)
└── states.ts         # remove 'building' from STUB_STATES (D-?: still aggregates G-01 verbs — see pitfall)
src/config.ts         # flip placeRetries default to 2-3; add shelter-need + default dims thresholds
src/motivation/
├── needs.ts          # activate the 'shelter' need (today stub) — D-12 trigger
└── goals.ts          # generate build:shelter goal from shelter need
```

### Pattern 1: The generic builder loop (D-01 — mirrors `smelt` "re-runs between items")
**What:** one skill-run iterates an ordered blueprint; each block is a yield point.
**When:** the single core of the whole phase.
**Shape (synthesized from `shelter.ts` + `station.ts` + `nodes.ts` execute-node abort pattern):**
```typescript
// Source: synthesis of src/skills/placeBlock.ts (placeBlockSafe/getRefAndFace/isFilled),
//         src/skills/executor.ts (gaussianDelay), src/grounding/types.ts (SkillResult).
export async function runBlueprint(
  bot: Bot,
  blueprint: ReadonlyArray<{ pos: { x:number;y:number;z:number }; bloco: string }>,
  signal?: AbortSignal,
): Promise<SkillResult> {
  const ordered = orderForReach(blueprint, bot)        // D-05 (see Pattern 2)
  let placed = 0
  const total = blueprint.length
  for (const { pos, bloco } of ordered) {
    if (signal?.aborted) break                          // D-15: cede a lifeCritical entre blocos
    if (isFilled(bot, pos)) { placed++; continue }      // D-03/D-04 idempotency skip
    const item = selectMaterial(bot, bloco)             // D-? prefer cobblestone/dirt over useful
    if (!item) continue                                  // sem material → pula (degrada, não lança)
    const ok = await placeOneWithRetry(bot, pos, item)  // D-02 retry body (Pattern 3)
    if (ok) placed++
    await sleep(gaussianDelay(BUILD_BLOCK_DELAY_MEAN, BUILD_BLOCK_DELAY_STD)) // D-01 pacing between blocks
  }
  // D-03/D-10: outcome by REAL coverage, not by Promise resolution.
  const covered = blueprint.filter(b => isFilled(bot, b.pos)).length
  const outcome: SkillOutcome =
    covered >= total ? 'success' : covered > 0 ? 'partial' : 'no_effect'
  return { outcome, observed: covered, expected: total, delta: {} }
}
```
> NOTE: the existing `placeBlockSafe` already calls `bot.equip(blockItem,'hand')` internally and already swallows the `blockUpdate` timeout. The builder does NOT re-implement equip/swallow — it calls `placeBlockSafe` per block. `selectMaterial` resolves the concrete `Item` from the inventory (mirror `shelter.ts:43` `bot.inventory.items().find(...)`).

### Pattern 2: Deterministic reach-preserving order (D-05)
**What:** sort blocks so the bot never walls itself in and every target stays reachable.
**Reference:** mineflayer-builder (`PrismarineJS/mineflayer-builder`, verified upstream) sorts pending actions by **squared distance to the bot**, picks the closest placeable, equips **after** pathing, and resolves face via `getFaceAndRef`. It does NOT special-case self-burial — it relies on per-block reach validation (`getFaceAndRef` returning null when no face is reachable) to skip un-placeable targets, which is exactly what our `getRefAndFace` already does.
**Recommended algorithm (matches D-05 "baixo→cima, fora→dentro, própria célula por último"):**
```typescript
function orderForReach(bp, bot) {
  const bx = Math.floor(bot.entity.position.x), by = Math.floor(bot.entity.position.y), bz = Math.floor(bot.entity.position.z)
  const isBotCell = (p) => p.x===bx && (p.y===by || p.y===by+1) && p.z===bz  // feet + head cell last
  return [...bp].sort((a, b) => {
    if (isBotCell(a.pos) !== isBotCell(b.pos)) return isBotCell(a.pos) ? 1 : -1  // bot cell LAST
    if (a.pos.y !== b.pos.y) return a.pos.y - b.pos.y                            // baixo → cima
    // fora → dentro: maior distância horizontal ao centro primeiro (paredes antes do miolo)
    return horizDistFromCenter(b.pos, bp) - horizDistFromCenter(a.pos, bp)
  })
}
```
**Important:** because `getRefAndFace` returns null when the bot's own body occupies the only reachable face, the bot-cell-last ordering + per-block skip is the self-burial guard. For the shelter "tampar o teto" block (the cell directly above the bot), reuse the exact `shelter.ts` mechanic: the bot pillars up or digs down first so the ceiling block has a reachable face. **This is the single trickiest geometry detail — see Pitfall 1.**

### Pattern 3: Idempotent retry body (D-02 — flip the reserved `placeRetries` ON)
**What:** retry a single block 2–3 times, re-checking `blockAt` first so a succeeded-but-lagged block is never re-placed.
```typescript
// config.placeRetries is currently 0 (RESERVED). Flip default to 2 (or 3) in config.ts.
async function placeOneWithRetry(bot, pos, item): Promise<boolean> {
  for (let attempt = 0; attempt <= config.placeRetries; attempt++) {
    if (isFilled(bot, pos)) return true                 // already there (the blockUpdate race) → done
    const rf = getRefAndFace(bot, pos)                  // re-resolve ref/face each attempt
    if (!rf) return false                                // no reachable face → skip (D-04, not a throw)
    await bot.lookAt(makeVec(pos.x+0.5, pos.y+0.5, pos.z+0.5))  // D-02: re-lookAt before retry
    const r = await placeBlockSafe(bot, rf.ref, rf.face, item, pos)  // re-equips internally
    if (r.outcome === 'success') return true
  }
  return isFilled(bot, pos)                              // final world-truth check
}
```
> The retry MUST gate on `isFilled` first (the `blockUpdate` false-negative is *more* common in chained building per D-02). `placeBlockSafe` already derives `success` from `blockAt`, so a single retry pass typically converges. Keep `config.placeRetries` env-driven (`PLACE_RETRIES`), already validated `>= 0` in `config.ts:346`.

### Pattern 4: Deterministic blueprint generators (D-07/D-09)
**What:** pure functions `{tipo, dims, origin} → {pos, bloco}[]`. The LLM picks type/dims/origin, never coordinates.
```typescript
// Source: pure synthesis — no external API. Mirrors the LLM=director / skill=engineer philosophy (Phase 9).
type BuildKind = 'shelter' | 'wall' | 'tower'
interface BuildSpec { tipo: BuildKind; dims: { w:number; h:number; d:number }; origin: {x:number;y:number;z:number}; bloco?: string }

function genShelter(spec): Block[]  // full 6-face enclosure around origin: floor + 4 walls + ceiling,
                                    // hollow interior. Extends Phase 8 cavar-e-tampar to ALL sides (D-09).
function genWall(spec): Block[]     // w×h plane along one axis at origin
function genTower(spec): Block[]    // h-tall 1×1 (or n×n) column from origin upward
```
**Closure note (D-10):** the shelter generator must guarantee that after placement, **every neighbor of the bot's cell is solid**. Validate exactly as `shelter.ts:113-115` does — `bot.blockAt(pos.offset(...))` on the 6 neighbors (extend to all 6 from the existing single `above` check). `success` only when the full shell + all bot-cell neighbors are solid.

### Anti-Patterns to Avoid
- **Re-implementing equip / blockUpdate-swallow inside the builder.** `placeBlockSafe` already does both. Call it; don't fork it.
- **Coupling `build:*` into the Phase 9 G-01 `place` verb dispatch** (`nodes.ts:392-425`). D-14 requires a SEPARATE path. The `place` verb stays for ad-hoc single blocks the LLM emits; `build:*` is the deterministic multi-block path.
- **Touching `shelter.ts`.** D-11: the reflex keeps precedence and is untouched. Only borrow its `PLACEABLE` list (consider exporting it).
- **One-block-per-tick building.** D-01 explicitly: a whole blueprint runs in one skill-run with `gaussianDelay`+`AbortSignal` between blocks. Single-block-per-tick is the rejected slow path.
- **LLM emitting shelter coordinates.** D-09: the survival path (shelter) is deterministic-generator-only. Only ad-hoc/creative structures (D-08) take an LLM raw list.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Reliable single block placement | A new `bot.placeBlock` wrapper | `placeBlockSafe` (`placeBlock.ts:97`) | Already handles the `blockUpdate` false-negative, equip, and world-truth grounding (Phase 9 / Pitfall 1). |
| Choosing which neighbor to place against | A face-iteration helper | `getRefAndFace` (`placeBlock.ts:67`) | Pure, prefers bottom face, returns null when un-reachable — already the safety net of D-04. |
| "Is this position solid?" | Repeated `blockAt`+name checks | `isFilled` (`placeBlock.ts:51` — export it) | Single source of the air-vs-solid truth used everywhere. |
| Place a crafting table / furnace | Block-placement logic for stations | `ensureStation` (`station.ts:62`) | findBlock → navigate adjacent → fallback place → re-validate → POI. `build:station` IS this call. |
| Timeout / abort / pacing on the skill-run | A bespoke race | `executeWithSafety` (`executor.ts:65`) + `gaussianDelay` | Inherited timeout/abort/Box-Muller delay (D-16). |
| Material selection | A new placeable list | `shelter.ts` `PLACEABLE` regex (`shelter.ts:29`) | Reuse; extend only to prefer disposable cobblestone/dirt over useful blocks (Claude's discretion). |
| Goal→skill routing for build types | A new dispatcher subsystem | Mirror `goalToSkillParams` + `DAG_PREFIXES` (`nodes.ts:62,96`) | D-13 explicitly: same deterministic prefix pattern, decoupled from the LLM. |
| Reposition for reach | Raw movement | `bot.pathfinder.goto(new goals.GoalNear(x,y,z,range))` (`station.ts:84`) | Inherits 999.1 bounds; abort wired via `signal.addEventListener('abort', () => bot.pathfinder.stop())` (`station.ts:72`). |

**Key insight:** Phase 12's novelty is exactly three things — the **ordering pass**, the **retry body**, and the **generators**. Everything else is a call into Phase 7/8/9 code. A plan that introduces a new placement primitive is over-scoped.

## Runtime State Inventory

> This phase is additive (new skill + new goal prefix), not a rename/refactor. The five categories are answered explicitly for completeness.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | POI `'station'` already written by `ensureStation` via `upsertPlace`. A `build`/`base` POI for the finished shelter is OPTIONAL (CONTEXT canonical-refs line 86 marks it optional). `PlaceType` already includes `'base'` (`persistence.ts:26`) — no migration needed if used. | None required; optional POI write reuses existing `upsertPlace`. |
| Live service config | None — no external services (n8n, Datadog, etc.) touched. MineMind is a single local process. | None. |
| OS-registered state | None — no OS-level tasks/services. | None. |
| Secrets/env vars | New env vars are config-only (`PLACE_RETRIES` default flip, new `BUILD_*` thresholds). No secrets. `config.placeRetries` already read + validated (`config.ts:34,346`). | Flip `PLACE_RETRIES` default 0→2-3 in `config.ts`; add `BUILD_*` keys. |
| Build artifacts | None — no compiled artifacts; Bun runs TS directly. | None. |

**The canonical question — after every file is updated, what runtime systems still hold old state?** Nothing. The only persisted state is the optional shelter POI, and it goes through the same `upsertPlace` dedup as every other POI.

## Common Pitfalls

### Pitfall 1: The shelter ceiling block self-buries the bot (the geometry trap)
**What goes wrong:** the deterministic full-seal generator (D-09) places the ceiling directly above the bot. If placed naively, `getRefAndFace` finds no reachable face (the bot's head is in the way) and the block is skipped → the shelter has a hole → SC1 ("fecha de verdade") fails.
**Why it happens:** the bot occupies its own enclosure; the cell directly above + the wall cells at head height contend with the bot's body.
**How to avoid:** reuse the EXACT `shelter.ts` mechanic — the reflex already solves "seal my own ceiling" via cavar-e-tampar (dig down 1, then the ceiling target gets a reachable top face) or pilar 1×1. The deterministic shelter generator should place the bot-cell-adjacent blocks LAST (D-05 ordering) and, for the ceiling, fall back to the `shelter.ts` dig-down / pillar-up approach so a reachable face exists. Validate closure on ALL 6 neighbors, not just `above`.
**Warning signs:** `partial` outcome with exactly the ceiling or a head-height wall block missing; `getRefAndFace` returning null on the bot-cell neighbor.

### Pitfall 2: Chained building amplifies the `blockUpdate` false-negative (D-02 root cause)
**What goes wrong:** placing many blocks back-to-back makes the server lag more, so `bot.placeBlock` rejects with `did not fire within timeout` more often — even though the block WAS placed.
**Why it happens:** rapid placement saturates `blockUpdate` events; the 5000ms internal timeout fires before the update echoes back.
**How to avoid:** `placeBlockSafe` already swallows this (it reads `blockAt`, not the Promise). The retry body (D-02) MUST gate on `isFilled` first so it never double-places. The `gaussianDelay` between blocks (D-01) also reduces saturation. Never treat a `placeBlockSafe` throw as failure — the world is the truth.
**Warning signs:** logs showing repeated place attempts on a position that `blockAt` already reports solid.

### Pitfall 3: Coupling into the G-01 verb dispatch breaks Phase 9 (D-14)
**What goes wrong:** wiring `build:*` through the existing `state === 'building' && fresh` block (`nodes.ts:392-425`) entangles deterministic multi-block builds with the LLM's single-verb `place`/`craft`/`smelt`/`equip` dispatch, risking regressions in the Phase-9-complete G-01 path.
**Why it happens:** both live under the `building` cognitive state, so the temptation is to extend the same `if`.
**How to avoid:** add the `build:*` route in the SAME place the DAG router lives (`nodes.ts:326-349`, the `DAG_PREFIXES` block in `execute`), as a parallel prefix check BEFORE the gathering/exploring/building dispatch. The `build` skill takes its full params from the goal id + a stored spec, not from `fresh.decision.action`. Leave the G-01 block byte-for-byte unchanged.
**Warning signs:** any diff inside `nodes.ts:392-425`; G-01 craft/smelt tests regressing.

### Pitfall 4: `STUB_STATES` removal vs. the building state still aggregating G-01 verbs
**What goes wrong:** `states.ts:10` lists `'building'` in `STUB_STATES`, but `building` is NOT actually a stub anymore — Phase 9 G-01 already routes craft/smelt/equip/place through it (`nodes.ts:392`). Removing it from `STUB_STATES` is correct (D-?: "remover do stub ao implementar"), but verify nothing keys off `isStub('building')` to short-circuit the G-01 path.
**Why it happens:** the stub list is stale; the comment says stub but the code already dispatches.
**How to avoid:** grep `isStub` / `STUB_STATES` usages before removing `'building'`. Confirm removal only enables the new path and doesn't change G-01 behavior. (`fighting` stays a stub — Phase 13.)
**Warning signs:** `isStub('building')` used as a gate anywhere in the execute/analyze path.

### Pitfall 5: The shelter need is a STUB need — activating it (D-12) requires more than a config flip
**What goes wrong:** `motivation/types.ts:14-15` declares `shelter` in `STUB_NEEDS`, and `needs.ts:50-54` leaves stub needs unchanged (no decay). `generateGoals` (`goals.ts:27`) skips non-`ACTIVE_NEEDS`. So today a shelter need can never produce a goal.
**Why it happens:** shelter/social were deferred as stubs in Phase 3 (D-08 of that phase).
**How to avoid:** to satisfy D-12 ("need de abrigo → goal `build:shelter`"), either (a) promote `shelter` to `ACTIVE_NEEDS` and give `evaluateNeeds` a real shelter-satisfaction signal (night + no roof above the bot via `blockAt`), then have `generateGoals` emit a `build:shelter` goal; OR (b) wire a dedicated bridge in the `observe` node (mirroring the Phase 10 `resources need → resolveDag` bridge at `nodes.ts:200-257`) that, when night + exposed, sets `holder.currentGoal` to a `build:shelter` goal directly. Option (b) is lower-risk (keeps the motivation module's pure stub contract intact) and mirrors an existing, proven pattern. The fine trigger (night threshold / "no roof") is Claude's discretion.
**Warning signs:** a `build:shelter` goal that never gets generated; `shelter` need value frozen at 1.

### Pitfall 6: Player-request build goals need a new request kind (`SUPPORTED_REQUEST_KINDS` is closed)
**What goes wrong:** `conversation.ts:33` closes `SUPPORTED_REQUEST_KINDS = ['gather','follow','navigate']`. A player saying "build a shelter / wall / tower" matches none → no goal. Also, request goals are only generated in `ASSISTANT` disposition (`conversation.ts:155`), and a recent quick task (260622-nif) reverted `routePlayerTurn` so it no longer preempts the in-flight action.
**Why it happens:** the request taxonomy predates Phase 12.
**How to avoid:** extend `SUPPORTED_REQUEST_KINDS` with a `build` kind (and `detectRequestKind` keywords: construir/build/abrigo/parede/torre/shelter/wall/tower), and have `makePlayerRequestGoal` emit a `build:<sub>` goal id so the new `build:*` router picks it up. Confirm the disposition gate matches D-12 ("pedido direto do jogador" — verify whether build requests should work in AUTONOMOUS too, since 260622-nif made chat uniform across modes).
**Warning signs:** "constrói um abrigo" gets a conversational reply but no goal.

### Pitfall 7: `bot.lookAt` / faceVector object trick — keep using the `{x,y,z}` cast
**What goes wrong:** importing the real `Vec3` class at runtime is avoided across the codebase; `placeBlock.ts:46` and `shelter.ts:134` both use `makeVec(x,y,z)` returning `{x,y,z} as unknown as Vec3`. Mineflayer 4.37.1 accepts plain `{x,y,z}` for `faceVector` and `bot.lookAt`.
**How to avoid:** reuse the same `makeVec` helper (or import it) in the retry body's `lookAt`. Don't add a `vec3` runtime dependency.

## Code Examples

### Reaching a target before placing (reposition pattern, from `station.ts`)
```typescript
// Source: src/skills/station.ts:72-86 (verified in repo)
if (signal) {
  signal.addEventListener('abort', () => {
    try { bot.pathfinder.stop() } catch { /* pathfinder já parou */ }
  }, { once: true })
}
try {
  await bot.pathfinder.goto(new goals.GoalNear(target.x, target.y, target.z, 2)) // 999.1 bounds inherited
} catch {
  /* timeout/noPath: segue e re-valida com blockAt */
}
```

### Coverage grounding (extend `shelter.ts` single-face check to all 6)
```typescript
// Source: src/skills/shelter.ts:113-115 (verified) — generalize `above` to all neighbors
const NEIGHBORS = [[0,2,0],[0,-1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]] as const
const sealed = NEIGHBORS.every(([dx,dy,dz]) => {
  const b = bot.blockAt(pos.offset(dx, dy, dz))
  return b != null && b.name !== 'air' && b.name !== 'cave_air'
})
```

### Mirroring the deterministic goal router (D-13)
```typescript
// Source: pattern from src/cognition/nodes.ts:62,96 (DAG_PREFIXES / goalToSkillParams)
const BUILD_PREFIXES = ['build:'] as const
export function buildGoalToSkillParams(goalId: string): { skill: string; paramsJson: string } | null {
  if (!goalId.startsWith('build:')) return null
  const sub = goalId.slice('build:'.length)         // 'shelter' | 'wall' | 'tower' | 'station'
  return { skill: 'build', paramsJson: JSON.stringify({ tipo: sub }) }  // dims/origin filled by skill defaults or stored spec
}
```
Wire this in `execute` right beside the existing DAG check (`nodes.ts:331`): `if (snap && currentGoal && currentGoal.id.startsWith('build:')) { ... }`, BEFORE the gathering/building branches.

### Test convention (no `mock.module`; mock bot inline — from `shelter.test.ts`)
```typescript
// Source: src/skills/shelter.test.ts:7-58 (verified)
import { test, expect } from 'bun:test'
function vec(x,y,z) { return { x, y, z, offset:(ox,oy,oz)=>vec(x+ox,y+oy,z+oz) } }
// mock bot: { entity:{position}, inventory:{items:()=>[]}, blockAt, dig, placeBlock, equip, setControlState }
```
`station.ts` uses an injectable `__stationDeps` seam for `placeBlockSafe`/`getRefAndFace`/`upsertPlace` (`station.ts:23`). The builder should expose the same `__builderDeps` seam so tests stub `placeBlockSafe`/`getRefAndFace` without `mock.module` (which leaks globally in Bun — project convention).

## State of the Art

| Old (this repo, pre-Phase 12) | New (Phase 12) | Impact |
|-------------------------------|----------------|--------|
| `building` state = G-01 verb aggregator only (craft/smelt/equip/place single actions) | `building` also reachable via deterministic `build:*` goal that runs multi-block blueprints | Two parallel paths under one state; D-14 keeps the verb path intact |
| `config.placeRetries = 0` (reserved, body unimplemented) | `placeRetries = 2-3` with an idempotent retry body | First time the retry is live (Phase 9 D-04 explicitly deferred it here) |
| `shelter` reflex only (emergency, `lifeCritical`) | proactive deterministic full-seal shelter, distinct path | Survival no longer depends on the slow LLM path; reflex still has precedence (D-11/D-15) |
| `shelter`/`social` = `STUB_NEEDS` (no decay, never a goal) | `shelter` need (or observe-node bridge) → `build:shelter` goal | Activates BUILD-02 autonomous trigger (D-12) — see Pitfall 5 |

**No deprecated APIs.** mineflayer 4.37.1 `bot.placeBlock(referenceBlock, faceVector)`, `bot.equip(item,'hand')`, `bot.blockAt(pos)`, `bot.lookAt(point)`, `bot.dig(block)` are all current and already consumed in the repo.

## Open Questions

1. **Shelter need activation: promote to ACTIVE_NEEDS vs. observe-node bridge?**
   - What we know: D-12 requires a shelter need to produce `build:shelter`. Both mechanisms exist as precedent (the Phase 10 resources→DAG bridge at `nodes.ts:200`).
   - What's unclear: whether the planner wants the motivation module's stub contract changed (touches `needs.ts`/`types.ts`/`goals.ts`) or an isolated bridge in `observe`.
   - Recommendation: the observe-node bridge (Pitfall 5 option b) — lower blast radius, mirrors a proven pattern, keeps `shelter`/`social` stubs intact. Flag for the planner to confirm.

2. **Do build requests work in AUTONOMOUS, or only ASSISTANT?**
   - What we know: D-12 says "pedido direto do jogador" generates `build:*`. But `conversation.ts:155` only generates request goals in ASSISTANT, while quick task 260622-nif made chat responses uniform across both modes.
   - What's unclear: whether 260622-nif's "respond in both modes" intent extends to "act on build requests in both modes."
   - Recommendation: keep the ASSISTANT gate for goal generation (matches the existing `player_request` channel) unless the planner/user wants build requests honored in AUTONOMOUS. Flag explicitly.

3. **Where is the `{dims, origin}` spec stored between goal-selection and skill-execution?**
   - What we know: the `build:*` goal id only carries the sub-type (`build:shelter`). The generator needs `dims`+`origin`.
   - What's unclear: the router (D-13) is deterministic and the goal id is a string. dims/origin must come from somewhere — config defaults (Claude's discretion: "dimensões default de parede/torre"), the bot's current position (origin = where the bot stands), or a stored field on the goal/holder.
   - Recommendation: default dims from `config` + origin = bot's floored position at execution time (read inside the `build` skill). The LLM "choosing dims/origin" (D-07) is the ad-hoc/creative path (D-08), not the autonomous survival path. Confirm with planner.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| mineflayer | block placement / world read | ✓ (package.json) | 4.37.1 | — |
| mineflayer-pathfinder | reposition for reach | ✓ | 2.4.5 | navigate skill (also pathfinder-based) |
| zod | BuildSchema | ✓ | 4.4.3 | — |
| bun (runtime + test) | run / test | ✓ (project runtime) | — | Node fallback per STACK, not needed |
| Local Minecraft Java server (1.21.4) | live verification of SC1/SC2/SC3 | live-only (not a code dependency) | MC 1.21.4 (config default) | unit tests with mock bot cover logic; live soak validates SC3 (no-OOM, pacing) |
| LM Studio (local LLM) | LLM choosing build type/dims (ad-hoc path) | live-only | — | deterministic generators don't need the LLM (survival path is LLM-free by D-09) |

**Missing dependencies with no fallback:** none — Phase 12 adds no new packages.
**Missing dependencies with fallback:** none blocking. Live-server / LM Studio are runtime-verification surfaces, not build-time dependencies; the deterministic core is fully unit-testable with the existing mock-bot convention.

> **Validation Architecture section intentionally omitted:** `.planning/config.json` sets `workflow.nyquist_validation: false`. Test strategy: follow the existing `bun test` + inline mock-bot + `__deps` injection convention (`shelter.test.ts`, `station.test.ts`). Each new module (`builder.ts`, `blueprints.ts`) gets a colocated `*.test.ts`.

## Sources

### Primary (HIGH confidence)
- Repo source (read directly, 2026-06-22): `src/skills/placeBlock.ts`, `shelter.ts`, `station.ts`, `executor.ts`, `index.ts`; `src/grounding/{types,capture,evaluate}.ts`; `src/cognition/{nodes,arbiter,states,loop}.ts`; `src/motivation/{needs,goals,types}.ts`; `src/config.ts`; `src/perception/types.ts`; `src/memory/{places,persistence}.ts`; `src/chat/conversation.ts`; `src/llm/schemas.ts`; `src/skills/shelter.test.ts`.
- `package.json` (verified 2026-06-22): mineflayer 4.37.1, mineflayer-pathfinder 2.4.5, zod 4.4.3, chromadb 3.4.3, @langchain/langgraph ^1.4.4.
- `.planning/phases/12-building-deliberado/12-CONTEXT.md` (D-01..D-16, Claude's Discretion, Deferred) — locked decisions.
- `.planning/REQUIREMENTS.md` (BUILD-02, BUILD-03), `.planning/ROADMAP.md` (Phase 12 goal + 3 SC), `.planning/STATE.md` (history incl. quick 260622-nif).

### Secondary (MEDIUM confidence)
- `PrismarineJS/mineflayer-builder` `index.js` (fetched 2026-06-22) — placement ordering = sort by squared distance to bot, equip after pathing, face via `getFaceAndRef`, no explicit self-burial special-case (relies on per-block reach validation). Used to confirm the D-05 ordering approach; our `getRefAndFace` already provides the reach-validation skip.

### Tertiary (LOW confidence)
- None. No claim in this document rests on a single unverified web source.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new deps; all primitives read from source with exact signatures.
- Architecture / integration seams: HIGH — every seam line-anchored against current `nodes.ts`/`config.ts`/`states.ts`/`index.ts`.
- Placement ordering (D-05): MEDIUM-HIGH — algorithm synthesized from D-05 text + verified mineflayer-builder approach + the repo's own `getRefAndFace` reach guarantee. The exact ordering is Claude's discretion per CONTEXT.
- Pitfalls: HIGH — derived from reading the actual stub/need/dispatch code, not assumed.
- Shelter-need activation + player-request wiring: MEDIUM — two viable mechanisms identified with a recommendation; flagged as Open Questions for the planner.

**Research date:** 2026-06-22
**Valid until:** ~2026-07-22 (stable — pinned deps, internal-primitive-driven; the only churn risk is further quick tasks touching `conversation.ts`/`loop.ts` player-request wiring).
