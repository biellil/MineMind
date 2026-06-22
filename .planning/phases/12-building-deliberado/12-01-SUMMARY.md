---
phase: 12-building-deliberado
plan: 01
subsystem: skills
tags: [building, blueprint, placeBlock, idempotency, grounding, mineflayer]

# Dependency graph
requires:
  - phase: 09-placement-crafting
    provides: "placeBlockSafe/getRefAndFace/isFilled (primitivo robusto), ensureStation, config.placeRetries reservado"
  - phase: 08-system1-survival
    provides: "shelter.ts (mecânica cavar-e-tampar, PLACEABLE/UNSAFE_BELOW — reusado como referência D-09)"
  - phase: 07-grounding
    provides: "SkillResult tagueado por outcome (cobertura real, nunca a Promise)"
provides:
  - "blueprints.ts — geradores PUROS {tipo,dims,origin}→{pos,bloco}[] (genShelter/genWall/genTower/generateBlueprint)"
  - "builder.ts — runBlueprint (loop ordenado idempotente + retry + grounding por cobertura) e a skill build (shelter/wall/tower/station/custom)"
  - "isFilled exportado de placeBlock.ts (fonte única air-vs-sólido)"
  - "config.placeRetries LIGADO (default 2) + thresholds BUILD_* (delay/timeout/dims default)"
affects: [12-02-registro-skill, 12-03-loop-shelter, building, combate]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Gerador determinístico puro → blueprint → builder genérico (LLM=diretor / skill=engenheiro)"
    - "Seam de injeção __builderDeps (espelha __stationDeps) — testes sem mock.module"
    - "Grounding por cobertura REAL pós-loop (blockAt), nunca pela resolução das Promises"

key-files:
  created:
    - src/skills/blueprints.ts
    - src/skills/blueprints.test.ts
    - src/skills/builder.ts
    - src/skills/builder.test.ts
  modified:
    - src/skills/placeBlock.ts
    - src/config.ts

key-decisions:
  - "D-05 ordenação: célula do bot por último → y crescente (baixo→cima) → fora→dentro (distância horizontal² ao centro do blueprint)"
  - "D-02 placeRetries default flip 0→2; placeOneWithRetry checa isFilled antes de cada tentativa (nunca recoloca)"
  - "Material: prioridade nome-exato → descartável (cobblestone/dirt/...) → qualquer PLACEABLE; PLACEABLE duplicada de shelter.ts (não acopla a reflexa)"
  - "build station reusa ensureStation (não runBlueprint); custom usa lista crua de coords (D-08); shelter/wall/tower geram via spec com origin=floor(bot.position)"

patterns-established:
  - "Pattern 1: runBlueprint — um skill-run itera o blueprint inteiro, cada bloco é ponto de cedência (abort entre blocos), pacing gaussiano"
  - "Pattern 2: orderForReach determinístico reach-preserving (auto-soterro evitado por bot-cell-last + getRefAndFace=null skip)"
  - "Pattern 3: placeOneWithRetry idempotente (gate isFilled, re-resolve ref/face, verdade-do-mundo final)"

requirements-completed: [BUILD-02, BUILD-03]

# Metrics
duration: 7min
completed: 2026-06-22
---

# Phase 12 Plan 01: Núcleo Determinístico de Building Summary

**Geradores de blueprint puros (shelter casca-oca de 6 lados, wall, tower) + builder genérico idempotente `runBlueprint` que executa qualquer blueprint sobre `placeBlockSafe` com retry idempotente e grounding por cobertura real — independente do LLM acertar coordenadas.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-06-22T20:45:52Z
- **Completed:** 2026-06-22T20:52:27Z
- **Tasks:** 3
- **Files modified:** 6 (4 criados, 2 modificados)

## Accomplishments
- `genShelter` produz a casca OCA que fecha os 6 vizinhos da célula central (chão + 4 paredes + teto, miolo vazio) — base determinística do SC1 "fecha de verdade"
- `runBlueprint`: idempotente (pula `isFilled`), preemptável (abort ENTRE blocos), grounded por cobertura REAL (success só com cobertura total, senão partial/no_effect), nunca lança nem soterra (rede de segurança D-04)
- `placeOneWithRetry` liga o `config.placeRetries` reservado da Fase 9 (D-02) — re-tenta checando `isFilled` antes, nunca recoloca
- skill `build` resolve shelter/wall/tower (gerador), station (reusa `ensureStation`), custom (lista crua D-08), pronta para registro no Plan 02
- `isFilled` exportado de `placeBlock.ts` como fonte única da verdade air-vs-sólido

## Task Commits

Cada task committada atomicamente:

1. **Task 1: Geradores de blueprint puros (TDD)** - `f82195e` (feat)
2. **Task 2: Builder genérico idempotente + skill build (TDD, inclui export isFilled)** - `3f73f72` (feat)
3. **Task 3: Config — placeRetries ligado + thresholds de building** - `235b51d` (chore)

_Task 1 e 2 foram TDD (RED→GREEN): teste e implementação no mesmo commit (arquivos novos)._

## Files Created/Modified
- `src/skills/blueprints.ts` - Geradores puros determinísticos `{tipo,dims,origin}→{pos,bloco}[]`
- `src/skills/blueprints.test.ts` - Cobertura: casca/teto/miolo, determinismo, dims inválidas, fachada
- `src/skills/builder.ts` - `runBlueprint` + `orderForReach` + `placeOneWithRetry` + `selectMaterial` + skill `build` + `BuildSchema`/`buildTool` + `__builderDeps`
- `src/skills/builder.test.ts` - Cobertura inline mock-bot: vazio, 3-de-3, face-nula-pula, idempotência, abort-entre-blocos, retry
- `src/skills/placeBlock.ts` - `isFilled` exportado (única mudança)
- `src/config.ts` - `placeRetries` default 0→2; `buildBlockDelay*`/`buildTimeoutMs`/`build*Dims` + validações

## Assinaturas finais (handoff)

```typescript
// blueprints.ts
export function genShelter(spec: BuildSpec): BlueprintBlock[]
export function genWall(spec: BuildSpec): BlueprintBlock[]
export function genTower(spec: BuildSpec): BlueprintBlock[]
export function generateBlueprint(spec: BuildSpec): BlueprintBlock[]   // switch por tipo; desconhecido → []
export interface BuildSpec { tipo: 'shelter'|'wall'|'tower'; dims: {w,h,d}; origin: {x,y,z}; bloco?: string }
export interface BlueprintBlock { pos: {x,y,z}; bloco: string }

// builder.ts
export async function runBlueprint(bot, blueprint: ReadonlyArray<BlueprintBlock>, signal?: AbortSignal): Promise<SkillResult>
export async function build(bot, rawParams: unknown): Promise<SkillResult>
export const BuildSchema  // tipo ∈ {shelter,wall,tower,station,custom}, dims/origin/bloco/blocks opcionais
export const buildTool = { name: 'build', description, schema: BuildSchema, execute: build }
export const __builderDeps = { placeBlockSafe, getRefAndFace, isFilled }   // seam de injeção
```

## Decisions Made
- **D-05 (algoritmo de ordenação):** sort estável em cascata — `isBotCell` (pés `by`/cabeça `by+1` na coluna `bx,bz`) por ÚLTIMO; depois `y` crescente (baixo→cima); depois distância horizontal² ao **centro médio do blueprint** decrescente (fora→dentro). Auto-soterro é evitado pela combinação bot-cell-last + skip quando `getRefAndFace` retorna null.
- **D-02 (placeRetries):** default ligado em `2` (até 3 tentativas/bloco). `placeOneWithRetry` faz gate em `isFilled` antes de cada tentativa (o falso-negativo do `blockUpdate` é mais comum no building encadeado) e fecha com a verdade-do-mundo final.
- **selectMaterial:** prioridade nome-exato do blueprint → descartável (`cobblestone|dirt|cobbled_deepslate|netherrack`) → qualquer `PLACEABLE`. Regex `PLACEABLE` duplicada de `shelter.ts` (D-04) para não acoplar o builder à reflexa.
- **origin:** quando o caminho autônomo não fornece, `origin = floor(bot.entity.position)` (confirma Open Question 3 — o Plan 03 `build:shelter` herda isto: a casca nasce ao redor do bot).

## Deviations from Plan
None - plan executed exactly as written.

## Known Stubs
None. `build` para `tipo: 'station'`/`'custom'` está totalmente implementado (station via `ensureStation`, custom via lista crua). A skill ainda NÃO é registrada no índice nem roteada no loop — isso é escopo explícito dos Plans 02/03, não um stub.

## Issues Encountered
- O teste de retry (`builder.test.ts`) depende de `config.placeRetries >= 1`. Como o builder importa `config` no load, as mudanças de config (Task 3) foram aplicadas antes de validar a suite do builder; a árvore de trabalho tinha ambas no momento da verificação. Sem impacto — cada commit deixa a suite verde.
- Falha única na suite global (`config > carrega com valores default sem .env`) é PRÉ-EXISTENTE e documentada (o teste lê o `.env` local do dev que sobrescreve `config.host`). Não introduzida por este plano — confirmado: falha em `config.host` (linha 16), não em `placeRetries`.

## Next Phase Readiness
- **Plan 02 (registro da skill):** `build`/`buildTool`/`BuildSchema` prontos para registro em `skillRegistry`/`toolRegistry` e roteamento no execute node. O caminho `build:*` é SEPARADO do verbo `place` ad-hoc da Fase 9 (D-14).
- **Plan 03 (loop shelter):** `build` com `tipo:'shelter'` usa `origin = floor(bot.position)` (a casca fecha ao redor do bot) e `dims = config.buildShelterDims` (3×3×3) — confirmado no skill. O Plan 03 só precisa gerar o goal `build:shelter` a partir do need.
- `shelter.ts` (Fase 8) e `nodes.ts` (Fase 9 G-01) byte-for-byte intactos (D-11/D-14).

## Self-Check: PASSED

- Arquivos verificados: blueprints.ts, blueprints.test.ts, builder.ts, builder.test.ts, 12-01-SUMMARY.md — todos presentes
- Commits verificados: f82195e, 3f73f72, 235b51d — todos presentes

---
*Phase: 12-building-deliberado*
*Completed: 2026-06-22*
