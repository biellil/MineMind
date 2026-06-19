---
phase: quick/260619-qwx
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/perception/types.ts
  - src/perception/snapshot.ts
  - src/llm/prompts.ts
  - src/perception/types.test.ts
  - src/perception/snapshot.test.ts
  - src/llm/prompts.test.ts
autonomous: true
requirements: [PERC-01, PERC-02, PERC-04]

must_haves:
  truths:
    - "O snapshot inclui o bloco na mira do bot (lookingAt) ou null quando não há bloco no alcance"
    - "O snapshot inclui o nome do bloco sob os pés do bot (underfoot), com fallback seguro quando blockAt retorna null"
    - "O prompt do LLM renderiza lookingAt, underfoot e até ~5 entidades/mobs próximos (nome + distância)"
    - "Os campos existentes do WorldSnapshot permanecem inalterados (sem breaking change)"
  artifacts:
    - path: "src/perception/types.ts"
      provides: "Campos lookingAt e underfoot no contrato WorldSnapshot + tipo LookingAtBlock"
      contains: "lookingAt"
    - path: "src/perception/snapshot.ts"
      provides: "Captura defensiva de lookingAt (blockAtCursor) e underfoot (blockAt offset -1)"
      contains: "blockAtCursor"
    - path: "src/llm/prompts.ts"
      provides: "Render de lookingAt, underfoot e entities em serializeContext"
      contains: "Na mira"
  key_links:
    - from: "src/perception/snapshot.ts"
      to: "WorldSnapshot.lookingAt / WorldSnapshot.underfoot"
      via: "bot.blockAtCursor(5) e bot.blockAt(pos offset 0,-1,0)"
      pattern: "blockAtCursor|underfoot"
    - from: "src/llm/prompts.ts"
      to: "snapshot.lookingAt / snapshot.underfoot / snapshot.entities"
      via: "serializeContext lê os campos e monta linhas compactas"
      pattern: "snapshot\\.(lookingAt|underfoot|entities)"
---

<objective>
Enriquecer a percepção do bot para que o LLM saiba (a) onde está [já coberto por status.position], (b) o que está na mira dele [NOVO: lookingAt], e (c) o que tem perto dele [NOVO: underfoot + render das entities já capturadas].

Purpose: Fechar a lacuna de percepção identificada — o bloco na mira não era capturado e os mobs (entities) eram capturados mas nunca chegavam ao prompt. Sem isso o LLM decide "às cegas" sobre o que tem diretamente à sua frente e ao redor.

Output: Dois campos novos no WorldSnapshot (lookingAt, underfoot) capturados defensivamente em snapshot.ts e renderizados em serializeContext, mais o render das entities já existentes. Cobertura de teste para os três.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

@src/perception/types.ts
@src/perception/snapshot.ts
@src/llm/prompts.ts
@src/perception/types.test.ts

<interfaces>
<!-- Contratos relevantes já existentes. O executor usa estes diretamente — NÃO explorar o codebase. -->

Em src/perception/types.ts (NÃO remover/renomear — apenas ADICIONAR campos):
```typescript
export interface Position3D { readonly x: number; readonly y: number; readonly z: number }

export interface EntityInfo {
  readonly id: number
  readonly type: string
  readonly name: string        // username (player) ou name/type (mob)
  readonly position: Position3D
  readonly distance: number    // metros até o bot
  readonly health: number | null
  readonly metadata: unknown
}

export interface WorldSnapshot {
  readonly capturedAt: number
  readonly status: BotStatus
  readonly entities: ReadonlyArray<EntityInfo>   // JÁ capturado, ordenado por distância
  readonly players: ReadonlyArray<PlayerInfo>
  readonly nearbyBlockTypes: Readonly<Record<string, BlockSummary>>
  readonly inventory: ReadonlyArray<InventorySlot>
}
```

Mineflayer (Bot) — APIs a usar (ambas retornam `Block | null`):
```typescript
bot.blockAtCursor(maxDistance?: number): Block | null   // bloco encarado pelo bot
bot.blockAt(point: Vec3): Block | null                  // bloco em uma posição
// Block tem: .name (string), .position (Vec3 com x/y/z)
// bot.entity.position é um Vec3 com método .offset(dx,dy,dz): Vec3
```

Padrão já usado em snapshot.ts para extrair posição de um Block/Vec3:
```typescript
const block = bot.blockAt(bpos)   // pode ser null -> if (!block) continue
const name = block.name
{ x: bpos.x, y: bpos.y, z: bpos.z }   // Position3D a partir de Vec3
```

serializeContext (src/llm/prompts.ts) — já renderiza status, nearbyBlockTypes (até 8) e players (até 5, formato compacto `username (Nm)`). É tolerante a snapshot null. O bloco de render fica DENTRO do `if (snapshot) { ... }`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Adicionar campos lookingAt e underfoot ao contrato WorldSnapshot</name>
  <files>src/perception/types.ts, src/perception/types.test.ts</files>
  <behavior>
    - Um WorldSnapshot pode ser construído com lookingAt = { name, position, distance } e underfoot = "stone".
    - Um WorldSnapshot pode ser construído com lookingAt = null (sem bloco na mira).
    - Os campos pré-existentes (status, entities, players, nearbyBlockTypes, inventory, capturedAt) continuam obrigatórios e inalterados.
  </behavior>
  <action>
    Em src/perception/types.ts, ADICIONAR (não remover/renomear nada — campos existentes são breaking change p/ Fases 2/3/4):

    1. Novo tipo exportado, logo após EntityInfo ou BlockSummary:
    ```typescript
    /** Bloco diretamente na mira do bot (via bot.blockAtCursor). NOVO — enriquecimento de percepção. */
    export interface LookingAtBlock {
      readonly name: string          // ex.: "oak_log", "stone"
      readonly position: Position3D
      readonly distance: number      // metros do bot até o bloco encarado
    }
    ```

    2. Dois campos novos na interface WorldSnapshot, ao final (depois de inventory), com JSDoc:
    ```typescript
      /** Bloco na mira do bot (blockAtCursor); null quando não há bloco no alcance. NOVO. */
      readonly lookingAt: LookingAtBlock | null

      /** Nome do bloco sob os pés do bot (ex.: "air", "water", "stone"); "unknown" se indisponível. NOVO. */
      readonly underfoot: string
    ```

    Em src/perception/types.test.ts, ESTENDER o teste "pode construir um WorldSnapshot válido": adicionar `lookingAt` e `underfoot` ao objeto `snapshot` literal (ex.: `lookingAt: { name: 'oak_log', position: { x: 11, y: 64, z: -5 }, distance: 3.0 }, underfoot: 'grass_block'`) e novas asserts (`expect(snapshot.lookingAt?.name).toBe('oak_log')`, `expect(snapshot.underfoot).toBe('grass_block')`). Adicionar também um caso explícito para `lookingAt: null`. Atualizar o teste de imutabilidade (objeto literal congelado) para incluir os dois campos novos, mantendo o snapshot um WorldSnapshot completo.
  </action>
  <verify>
    <automated>bun test src/perception/types.test.ts</automated>
  </verify>
  <done>types.ts exporta LookingAtBlock e WorldSnapshot tem lookingAt (LookingAtBlock|null) e underfoot (string); types.test.ts passa cobrindo lookingAt preenchido, lookingAt null e underfoot.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Capturar lookingAt e underfoot em buildWorldSnapshot (defensivo a null)</name>
  <files>src/perception/snapshot.ts, src/perception/snapshot.test.ts</files>
  <behavior>
    - Quando bot.blockAtCursor(5) retorna um Block, lookingAt = { name, position {x,y,z}, distance = pos.distanceTo(block.position) }.
    - Quando bot.blockAtCursor(5) retorna null, lookingAt = null.
    - Quando bot.blockAt(pos.offset(0,-1,0)) retorna um Block, underfoot = block.name.
    - Quando bot.blockAt(pos.offset(0,-1,0)) retorna null, underfoot = "unknown".
    - O snapshot retornado continua congelado (Object.freeze) e sem referência ao bot.
  </behavior>
  <action>
    Em src/perception/snapshot.ts, dentro de buildWorldSnapshot, ADICIONAR a captura ANTES de montar `raw` (e incluir os campos em `raw`):

    1. lookingAt — usar bot.blockAtCursor com alcance 5 (escopo decidido); defensivo a null:
    ```typescript
    // === Enriquecimento: bloco na mira (blockAtCursor pode retornar null) ===
    const cursorBlock = bot.blockAtCursor(5)
    const lookingAt = cursorBlock
      ? {
          name: cursorBlock.name,
          position: { x: cursorBlock.position.x, y: cursorBlock.position.y, z: cursorBlock.position.z },
          distance: pos.distanceTo(cursorBlock.position),
        }
      : null
    ```

    2. underfoot — bloco em pos.offset(0,-1,0); blockAt pode retornar null -> fallback "unknown":
    ```typescript
    // === Enriquecimento: bloco sob os pés (blockAt pode retornar null) ===
    const belowBlock = bot.blockAt(pos.offset(0, -1, 0))
    const underfoot = belowBlock?.name ?? 'unknown'
    ```
    Nota: `pos` já existe no topo da função (`const pos = bot.entity.position`) e é um Vec3 com `.offset`.

    3. Incluir `lookingAt` e `underfoot` no objeto `raw: WorldSnapshot` (junto de status/entities/players/nearbyBlockTypes/inventory). NÃO mexer no structuredClone+Object.freeze final.

    Criar src/perception/snapshot.test.ts NOVO (não existe ainda). Seguir o padrão de mock de bot já usado em src/skills/dig.test.ts / src/cognition/loop.smoke.test.ts (objeto bot fake com as propriedades/métodos que buildWorldSnapshot acessa: entity.position {x,y,z, distanceTo, offset}, health, food, time.timeOfDay, entities {}, players {}, findBlocks () => [], inventory.items () => [], blockAt, blockAtCursor). Cobrir:
    - blockAtCursor retorna um Block fake -> lookingAt preenchido com name/position/distance.
    - blockAtCursor retorna null -> lookingAt === null.
    - blockAt(offset -1) retorna Block fake -> underfoot === block.name.
    - blockAt(offset -1) retorna null -> underfoot === 'unknown'.
    Dica de mock: o `pos` fake precisa de `offset(dx,dy,dz)` (retornar um objeto-posição) e `distanceTo(p)` (retornar um número). Use um Vec3 real de 'vec3' se já for dependência transitiva, OU um stub simples com esses dois métodos — o que for mais simples e estável.
  </action>
  <verify>
    <automated>bun test src/perception/snapshot.test.ts</automated>
  </verify>
  <done>snapshot.ts popula lookingAt (objeto ou null) e underfoot (nome ou "unknown") de forma defensiva; snapshot.test.ts passa cobrindo os 4 ramos (cursor Block/null, below Block/null).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Renderizar lookingAt, underfoot e entities em serializeContext</name>
  <files>src/llm/prompts.ts, src/llm/prompts.test.ts</files>
  <behavior>
    - Com snapshot.lookingAt preenchido, a saída contém uma linha "Na mira: {name} (Nm)".
    - Com snapshot.lookingAt null, NENHUMA linha "Na mira" é emitida.
    - A saída contém "Sob os pés: {underfoot}".
    - Com entities não-vazio, a saída contém "Entidades próximas:" com até ~5 entradas no formato "{name} (Nm)", ordenadas por distância (já vêm ordenadas do snapshot).
    - Com entities vazio, NENHUMA linha "Entidades próximas" é emitida.
    - serializeContext continua tolerante a snapshot null (não lança).
  </behavior>
  <action>
    Em src/llm/prompts.ts, dentro de serializeContext, no bloco `if (snapshot) { ... }`, ADICIONAR após a linha de "Jogadores próximos" (e antes de fechar o if), seguindo o estilo compacto já usado para players:

    ```typescript
    // Bloco na mira (NOVO)
    if (snapshot.lookingAt) {
      lines.push(`Na mira: ${snapshot.lookingAt.name} (${Math.round(snapshot.lookingAt.distance)}m)`)
    }

    // Bloco sob os pés (NOVO)
    lines.push(`Sob os pés: ${snapshot.underfoot}`)

    // Entidades/mobs próximos (JÁ capturados; render NOVO, limite ~5, compacto)
    const nearbyEntities = snapshot.entities
      .slice(0, 5)
      .map((e) => `${e.name} (${Math.round(e.distance)}m)`)
    if (nearbyEntities.length > 0) {
      lines.push(`Entidades próximas: ${nearbyEntities.join(', ')}`)
    }
    ```
    Manter o orçamento de prompt: limite de 5 entidades e formato compacto, espelhando o tratamento de players (prompts.ts:110-115). NÃO alterar a captura de entities (já feita no snapshot.ts) nem o branch `else` de snapshot null.

    Atualizar o JSDoc da função serializeContext para mencionar que agora inclui também "bloco na mira (lookingAt), bloco sob os pés (underfoot) e até ~5 entidades próximas".

    Criar src/llm/prompts.test.ts NOVO. Montar um WorldSnapshot literal mínimo (reaproveitar a forma do src/perception/types.test.ts) e cobrir:
    - lookingAt preenchido -> saída contém "Na mira: oak_log".
    - lookingAt null -> saída NÃO contém "Na mira".
    - underfoot "grass_block" -> saída contém "Sob os pés: grass_block".
    - entities com 2 itens -> saída contém "Entidades próximas:" com os dois nomes; com >5 itens -> só 5 renderizados.
    - entities vazio -> saída NÃO contém "Entidades próximas".
    - serializeContext(null, undefined, undefined, []) não lança e retorna "(sem percepção disponível)".
  </action>
  <verify>
    <automated>bun test src/llm/prompts.test.ts</automated>
  </verify>
  <done>serializeContext emite "Na mira" (só quando há bloco), "Sob os pés" sempre, e "Entidades próximas" (até 5, compacto, só quando há entities); prompts.test.ts passa em todos os ramos e snapshot null continua seguro.</done>
</task>

</tasks>

<verification>
- `bun test src/perception/types.test.ts src/perception/snapshot.test.ts src/llm/prompts.test.ts` — todos passam.
- `bun test` (suite completa) — nenhum teste pré-existente quebra (campos novos são aditivos; checar especialmente smoke tests do loop que constroem snapshots/mocks de bot).
- `bunx tsc --noEmit` (ou o typecheck do projeto) — sem erros de tipo (WorldSnapshot agora exige lookingAt/underfoot em qualquer literal — atualizar quaisquer literais de teste existentes que construam WorldSnapshot manualmente).
</verification>

<success_criteria>
- WorldSnapshot tem lookingAt: LookingAtBlock | null e underfoot: string, sem remover/renomear campos existentes.
- buildWorldSnapshot captura ambos defensivamente (blockAtCursor null -> null; blockAt null -> "unknown") e mantém o snapshot congelado/sem referência ao bot.
- serializeContext renderiza lookingAt (condicional), underfoot (sempre) e até 5 entities (compacto, condicional), respeitando o orçamento de prompt.
- Cobertura de teste nova/estendida para os três pontos; suite completa e typecheck verdes.
</success_criteria>

<output>
Após completar, criar `.planning/quick/260619-qwx-enriquecer-percepcao-lookingat-bloco-na-/260619-qwx-SUMMARY.md`.
</output>
