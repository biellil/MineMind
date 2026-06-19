---
phase: 01-presenca-e-conexao-fundacao-sem-llm
reviewed: 2026-06-19T02:02:47Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - package.json
  - tsconfig.json
  - bunfig.toml
  - .env.example
  - src/config.ts
  - src/perception/types.ts
  - src/bot/connection.ts
  - src/bot/index.ts
  - src/perception/snapshot.ts
  - src/skills/executor.ts
  - src/skills/navigate.ts
  - src/skills/dig.ts
  - src/skills/follow.ts
  - src/skills/attack.ts
  - src/skills/index.ts
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
status: issues_found
---

# Fase 01: Relatório de Code Review

**Revisado:** 2026-06-19T02:02:47Z
**Profundidade:** standard
**Arquivos Revisados:** 15
**Status:** issues_found

## Resumo

A base do projeto está bem estruturada: separação de responsabilidades clara, tipagem TypeScript rigorosa com interfaces `readonly`, validação Zod nos limites de entrada e mecanismo de reconexão correto seguindo o padrão canônico do Mineflayer. O `executor.ts` tem uma arquitetura sólida com timeout e watchdog.

Foram encontrados 1 bug crítico (lógica de dia/noite sempre falsa), 4 avisos relacionados a vazamentos de timer, NaN silencioso em config, e watchdog ausente em operação de mineração por coordenada, além de 3 itens de qualidade de código (imports duplicados e pattern de import dinâmico desnecessário).

---

## Critical Issues

### CR-01: `isDay` sempre `false` — `bot.time.timeOfDay` é tick (0–24000), não fração (0.0–1.0)

**File:** `src/perception/snapshot.ts:31`

**Issue:** O código calcula `isDay: bot.time.timeOfDay < 0.5`, mas `bot.time.timeOfDay` retorna um valor inteiro no intervalo 0–24000 (ticks de Minecraft), nunca uma fração entre 0.0 e 1.0. Qualquer tick >= 1 (ou seja, todos os ticks possíveis exceto exatamente `0`) é maior que `0.5`, portanto `isDay` será `false` na quase totalidade do tempo. O campo `BotStatus.timeOfDay` no `types.ts` linha 57 documenta incorretamente como "0.0 (meia-noite) a 1.0" quando na realidade a API retorna ticks crus.

**Fix:**

```typescript
// Em snapshot.ts, linha 31:
// Errado:
isDay: bot.time.timeOfDay < 0.5,

// Correto (dia: ticks 0–12999; noite: ticks 13000–23999):
isDay: bot.time.timeOfDay < 13000,
```

Atualizar também o comentário em `types.ts` linha 57:

```typescript
// Em types.ts, linha 57:
// Antes:
readonly timeOfDay: number    // 0.0 (meia-noite) a 1.0 (meia-noite seguinte); < 0.5 = dia

// Depois:
readonly timeOfDay: number    // ticks Minecraft 0–24000; dia = 0–12999, noite = 13000–23999
readonly isDay: boolean       // true se timeOfDay < 13000
```

---

## Warnings

### WR-01: Timer de timeout nunca cancelado — `SkillTimeoutError` pode rejeitar promise já resolvida

**File:** `src/skills/executor.ts:77-80`

**Issue:** O `setTimeout` que cria `timeoutPromise` não tem seu handle armazenado, portanto nunca é cancelado via `clearTimeout`. Quando a skill termina antes do timeout (caminho feliz), o timer continua ativo e, ao disparar, chama `reject(new SkillTimeoutError(...))` em uma promise que já foi resolvida pelo `Promise.race`. Isso não causa crash imediato — a rejeição de uma promise já settled é silenciosa em JS —, mas o timer permanece vivo desnecessariamente até disparar, impedindo o processo de terminar limpo e potencialmente causando `UnhandledPromiseRejection` em versões futuras do runtime ou ao usar `.catch()` separado.

**Fix:**

```typescript
// executor.ts — armazenar e cancelar o timer de timeout

let timeoutTimer: ReturnType<typeof setTimeout> | undefined
const timeoutPromise = new Promise<never>((_, reject) => {
  timeoutTimer = setTimeout(() => reject(new SkillTimeoutError(timeoutMs)), timeoutMs)
})

try {
  const racers: Promise<T | never>[] = [action(), timeoutPromise]
  if (progressChecker) racers.push(watchdogPromise)
  const result = await Promise.race(racers)
  await new Promise<void>((r) => setTimeout(r, gaussianDelay(200, 80)))
  return result
} finally {
  if (timeoutTimer !== undefined) clearTimeout(timeoutTimer)
  if (watchdogTimer !== undefined) clearInterval(watchdogTimer)
}
```

---

### WR-02: `watchdogPromise` nunca resolve quando `progressChecker` está ausente — handle vivo no heap

**File:** `src/skills/executor.ts:84-99`

**Issue:** Quando `progressChecker` não é fornecido, a linha `if (!progressChecker) return` retorna do executor da Promise sem jamais chamar `resolve` ou `reject`. O objeto Promise fica pendente para sempre no heap enquanto o processo rodar. Como `watchdogPromise` não é adicionada ao `racers` nesse caso (linha 103), não há consequência funcional imediata, mas é um padrão de memory leak para skills sem watchdog chamadas repetidamente (ex: loop cognitivo da Fase 2).

**Fix:**

```typescript
const watchdogPromise = new Promise<never>((_, reject) => {
  if (!progressChecker) return  // Promise pendente — nunca limpa

  // ... lógica do intervalo
})
```

Substituir por:

```typescript
// Criar watchdog apenas se progressChecker for fornecido
const watchdogPromise: Promise<never> | null = progressChecker
  ? new Promise<never>((_, reject) => {
      let lastValue = progressChecker()
      let lastProgressAt = Date.now()
      watchdogTimer = setInterval(() => {
        const current = progressChecker!()
        if (current !== lastValue) {
          lastValue = current
          lastProgressAt = Date.now()
        } else if (Date.now() - lastProgressAt > noProgressToleranceMs) {
          reject(new SkillStuckError(noProgressToleranceMs))
        }
      }, progressIntervalMs)
    })
  : null

const racers: Promise<T | never>[] = [action(), timeoutPromise]
if (watchdogPromise) racers.push(watchdogPromise)
```

---

### WR-03: `parseInt` em variáveis de ambiente retorna `NaN` para string vazia — propagado silenciosamente

**File:** `src/config.ts:13,16`

**Issue:** Se uma variável de ambiente for definida com valor vazio (ex: `NAVIGATE_TIMEOUT_MS=` ou `DIG_TIMEOUT_MS=`), `process.env.NAVIGATE_TIMEOUT_MS` é a string vazia `""`, que não ativa o `??` (nullish coalescing só trata `null`/`undefined`). `parseInt('', 10)` retorna `NaN`. O `config.navigateTimeoutMs` ou `config.digTimeoutMs` será `NaN`. Isso é passado para `executeWithSafety` como `timeoutMs`, onde `setTimeout(fn, NaN)` é tratado como `setTimeout(fn, 0)` — disparando imediatamente — fazendo toda skill falhar com `SkillTimeoutError` instantaneamente. Não há validação de sanidade para esses campos como existe para `perceptionRadius` e `port`.

**Fix:**

```typescript
// config.ts — adicionar validação após os parseInts

const navigateTimeoutMs = parseInt(process.env.NAVIGATE_TIMEOUT_MS ?? '30000', 10)
const digTimeoutMs = parseInt(process.env.DIG_TIMEOUT_MS ?? '10000', 10)

if (isNaN(navigateTimeoutMs) || navigateTimeoutMs < 1000) {
  throw new Error(`NAVIGATE_TIMEOUT_MS inválido: "${process.env.NAVIGATE_TIMEOUT_MS}". Deve ser um número >= 1000ms.`)
}
if (isNaN(digTimeoutMs) || digTimeoutMs < 1000) {
  throw new Error(`DIG_TIMEOUT_MS inválido: "${process.env.DIG_TIMEOUT_MS}". Deve ser um número >= 1000ms.`)
}

export const config = {
  // ...
  navigateTimeoutMs,
  digTimeoutMs,
  // ...
} as const
```

---

### WR-04: Ausência de `progressChecker` no `dig` por coordenada — bot preso só detectado pelo timeout global

**File:** `src/skills/dig.ts:62-69`

**Issue:** Quando `dig` é chamado com uma posição específica (bloco por coordenada XYZ), `executeWithSafety` é chamado sem `progressChecker`. Um bot que chega ao bloco mas não consegue minerá-lo (sem ferramenta adequada, bloco inquebrável, bug no pathfinder) ficará preso silenciosamente até o `digTimeoutMs` expirar (10s por padrão). O caminho de coleta por nome (linha 44) tem watchdog de inventário; a inconsistência torna o comportamento imprevisível.

**Fix:**

```typescript
// dig.ts — adicionar progressChecker baseado em digging state ou distância

await executeWithSafety(
  () => bot.dig(blockAtPos),
  {
    timeoutMs: config.digTimeoutMs,
    // Watchdog: distância ao bloco diminui enquanto o bot navega; durante dig, o bloco desaparece
    progressChecker: () => {
      const remaining = bot.blockAt({ x: target.x, y: target.y, z: target.z } as Parameters<typeof bot.blockAt>[0])
      // Se bloco sumiu (minerado com sucesso), retorna -1 para indicar progresso final
      if (!remaining || remaining.type === 0) return -1
      // Enquanto ainda existe, usar inventário como proxy de progresso
      return bot.inventory.items().reduce((sum, item) => sum + item.count, 0)
    },
    progressIntervalMs: 1_000,
    noProgressToleranceMs: config.digTimeoutMs,
  }
)
```

---

## Info

### IN-01: Imports duplicados no `skills/index.ts` — mesmas symbols importadas duas vezes

**File:** `src/skills/index.ts:7-10,40-43`

**Issue:** `navigateTool`, `digTool`, `followTool` e `attackTool` são re-exportados na linha 7-10 e importados novamente explicitamente nas linhas 40-43. A segunda bateria de imports é redundante pois as symbols já estão em escopo.

**Fix:**

```typescript
// Remover as linhas 40-43:
// import { navigateTool } from './navigate'   // <-- remover
// import { digTool } from './dig'             // <-- remover
// import { followTool } from './follow'       // <-- remover
// import { attackTool } from './attack'       // <-- remover

// As linhas 7-10 já trazem os símbolos para o escopo do módulo via re-export.
// O toolRegistry pode referenciar as variáveis diretamente sem novo import.
```

---

### IN-02: `skillRegistry` usa `import()` dinâmico desnecessário para módulos já importados estaticamente

**File:** `src/skills/index.ts:28-33`

**Issue:** O `skillRegistry` (linhas 28-33) resolve cada skill via `import()` dinâmico em tempo de execução, mas as mesmas funções (`navigate`, `dig`, `follow`, `attack`) já são importadas e re-exportadas estaticamente nas linhas 7-10. O import dinâmico adiciona latência de microtask na primeira chamada e introduz inconsistência de padrão sem benefício.

**Fix:**

```typescript
// Substituir o skillRegistry por referências diretas às funções já importadas:
import { navigate } from './navigate'
import { dig } from './dig'
import { follow } from './follow'
import { attack } from './attack'

export const skillRegistry: Record<string, SkillFunction> = {
  navigate,
  dig,
  follow,
  attack,
}
```

---

### IN-03: Filtro de jogadores em `snapshot.ts` exclui silenciosamente jogadores com entidade não carregada

**File:** `src/perception/snapshot.ts:54`

**Issue:** A linha `filter((p) => p.entity != null && p.username !== bot.username)` descarta silenciosamente qualquer jogador cujo chunk não esteja carregado. Isso é comportamento correto do ponto de vista de percepção, mas não há comentário explicando a decisão. A interface `PlayerInfo.position` aceita `null` exatamente para esse caso, sugerindo que a intenção original era incluir jogadores com posição `null`. A diferença pode confundir o loop cognitivo na Fase 2 ao tentar interagir com um jogador que "sumiu" do snapshot.

**Fix:** Adicionar comentário explicativo e avaliar se jogadores sem entidade carregada (mas conhecidos via `bot.players`) devem aparecer no snapshot com `position: null`:

```typescript
// Opção A — manter filtro atual, documentar razão:
.filter((p) => p.entity != null && p.username !== bot.username)  // exclui jogadores fora do chunk

// Opção B — incluir todos os jogadores conhecidos (position ficará null):
.filter((p) => p.username !== bot.username)  // inclui jogadores fora do chunk com position: null
```

---

_Revisado: 2026-06-19T02:02:47Z_
_Revisor: Claude (gsd-code-reviewer)_
_Profundidade: standard_
