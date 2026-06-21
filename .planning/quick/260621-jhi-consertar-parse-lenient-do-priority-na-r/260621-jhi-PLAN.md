---
phase: quick-260621-jhi
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/llm/schemas.ts
  - src/cognition/reflection.ts
  - src/cognition/reflection.test.ts
  - src/llm/schemas.test.ts
autonomous: true
requirements: [QUICK-260621-jhi]

must_haves:
  truths:
    - "ReflectionOutputSchema.parse NÃO lança quando goalUpdates[].priority está fora de [0,1] (ex.: 10/12/8 do modelo local)"
    - "applyGoalUpdates clampa priority para [0,1] ao aplicar reprioritize (priority 10 -> 1, priority -3 -> 0)"
    - "Com priority fora de faixa, summary válido sobrevive ao parse e o caminho de embedding/Chroma não é mais bloqueado por esse campo irrelevante"
  artifacts:
    - path: "src/llm/schemas.ts"
      provides: "priority lenient (z.number().optional() sem .min/.max), JSON-schema gerável (sem .transform — D-16)"
      contains: "priority: z.number().optional()"
    - path: "src/cognition/reflection.ts"
      provides: "clamp de priority na aplicação (Math.max(0, Math.min(1, ...)))"
      contains: "Math.min(1"
  key_links:
    - from: "src/llm/schemas.ts ReflectionOutputSchema"
      to: "src/cognition/deliberation.ts runReflection (parse L242)"
      via: "parse lenient não derruba summary"
      pattern: "priority:\\s*z\\.number\\(\\)\\.optional"
    - from: "src/cognition/reflection.ts applyGoalUpdates"
      to: "Goal.priority (faixa [0,1] garantida onde importa)"
      via: "clamp aritmético"
      pattern: "Math\\.max\\(0,\\s*Math\\.min\\(1"
---

<objective>
Tornar o parse da reflexão LENIENT no campo `goalUpdates[].priority` para destravar a escrita do vetor no ChromaDB. Hoje o modelo local emite `priority` 10/12/8 (escala errada), `ReflectionOutputSchema.parse` lança inteiro por causa do `.min(0).max(1)`, o `summary` válido é descartado no catch, o embedding nunca é gerado e o `addVector` no Chroma é pulado — Chroma fica em 0 vetores apesar da reflexão disparar.

Padrão aplicado (alinhado ao STACK: modelos locais derivam sem enforcement): **validar lenient, clampar na aplicação**. O schema aceita qualquer número; a faixa [0,1] é garantida em `applyGoalUpdates`, único lugar onde a priority realmente importa.

Purpose: um campo irrelevante para o vetor não pode mais derrubar o pipeline de memória semântica.
Output: schema lenient + clamp na aplicação + teste de regressão que prova que priority fora de faixa NÃO derruba o parse e é clampado.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

<interfaces>
<!-- Contratos relevantes — extraídos do código. Executor usa diretamente, sem explorar. -->

ANTES — src/llm/schemas.ts (L49-56):
```typescript
export const ReflectionOutputSchema = z.object({
  summary: z.string().max(500),
  goalUpdates: z.array(z.object({
    id: z.string(),
    action: z.enum(['keep', 'drop', 'reprioritize']),
    priority: z.number().min(0).max(1).optional(),   // <-- DERRUBA o parse inteiro
  })).max(8).default([]),
})
```

ANTES — src/cognition/reflection.ts applyGoalUpdates (L117-118):
```typescript
if (u.action === 'reprioritize' && u.priority !== undefined) {
  out.push({ ...g, priority: u.priority })   // <-- aplica sem clamp
  continue
}
```

Cadeia do bug (src/cognition/deliberation.ts runReflection):
- L242 `ReflectionOutputSchema.parse(...)` lança → catch → `summary` fica undefined.
- L255 `if (holder.db && summary)` pula embedding → `emb = null`.
- L267 `if (chroma && emb && summary && idConsolidado != null)` é FALSO → `addVector` pulado → Chroma em 0.
(Este arquivo NÃO precisa ser editado — o fix é upstream no schema + clamp.)

NOTA D-16: NÃO usar `.transform()` no schema — quebra a geração de JSON-schema via `z.toJSONSchema` que o provider local usa. Apenas remover `.min/.max` e opcionalmente `.describe(...)`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Schema lenient no priority + clamp na aplicação</name>
  <files>src/llm/schemas.ts, src/cognition/reflection.ts, src/cognition/reflection.test.ts, src/llm/schemas.test.ts</files>
  <behavior>
    - ReflectionOutputSchema.parse({ summary: 'ok', goalUpdates: [{ id: 'a', action: 'reprioritize', priority: 10 }] }) NÃO lança e preserva summary === 'ok'.
    - ReflectionOutputSchema.parse(...) ainda aceita priority omitido (optional) e priority em faixa (0.9).
    - applyGoalUpdates([goal('a', 0.2)], [{ id: 'a', action: 'reprioritize', priority: 10 }], now) => out[0].priority === 1 (clamp superior).
    - applyGoalUpdates([goal('a', 0.2)], [{ id: 'a', action: 'reprioritize', priority: -3 }], now) => out[0].priority === 0 (clamp inferior).
    - Teste existente "reprioritize muda priority (com priority 0.9)" continua passando (0.9 dentro da faixa não é alterado).
  </behavior>
  <action>
    EDIT 1 — src/llm/schemas.ts (L54): trocar
      `priority: z.number().min(0).max(1).optional(),`
    por
      `priority: z.number().optional().describe('urgência normalizada em [0,1]; valores fora da faixa são clampados na aplicação'),`
    Remover `.min(0).max(1)` (parse não falha mais por faixa). NÃO usar `.transform()` (D-16: quebraria z.toJSONSchema do provider local). O `.describe(...)` apenas guia o modelo.

    EDIT 2 — src/cognition/reflection.ts (L117-118): no ramo `reprioritize`, clampar ao aplicar.
    Trocar:
      `out.push({ ...g, priority: u.priority })`
    por:
      `out.push({ ...g, priority: Math.max(0, Math.min(1, u.priority)) })`
    Manter o guard `u.priority !== undefined` exatamente como está (reprioritize sem priority continua no-op de prioridade). Garante a faixa [0,1] onde realmente importa.

    EDIT 3 — src/cognition/reflection.test.ts: adicionar 2 testes na seção applyGoalUpdates (após o teste "reprioritize muda priority", ~L174), reusando o helper `goal(id, priority)` existente:
      - test('applyGoalUpdates: clampa priority acima de 1 para 1'): goals=[goal('a',0.2)], updates=[{id:'a',action:'reprioritize',priority:10}] => expect(out[0]!.priority).toBe(1)
      - test('applyGoalUpdates: clampa priority abaixo de 0 para 0'): goals=[goal('a',0.2)], updates=[{id:'a',action:'reprioritize',priority:-3}] => expect(out[0]!.priority).toBe(0)
    Tipar updates como `ReflectionOutput['goalUpdates']` (já importado no arquivo).

    EDIT 4 — src/llm/schemas.test.ts: importar `ReflectionOutputSchema` (somar ao import existente de './schemas') e adicionar 1 teste de regressão do parse lenient:
      - test('ReflectionOutputSchema: priority fora de [0,1] NÃO derruba o parse e summary sobrevive'): const out = ReflectionOutputSchema.parse({ summary: 'resumo válido', goalUpdates: [{ id: 'g1', action: 'reprioritize', priority: 10 }] }); expect(out.summary).toBe('resumo válido'); expect(out.goalUpdates[0]!.priority).toBe(10)
    (Confirma que o campo irrelevante para o vetor não bloqueia mais o pipeline; o clamp acontece depois, em applyGoalUpdates.)
  </action>
  <verify>
    <automated>bun test src/cognition/reflection.test.ts src/llm/schemas.test.ts && bunx tsc --noEmit</automated>
  </verify>
  <done>
    - schemas.ts L54: priority é `z.number().optional()` sem `.min/.max` e sem `.transform`.
    - reflection.ts: reprioritize aplica `Math.max(0, Math.min(1, u.priority))`.
    - bun test passa, incluindo os novos testes (clamp >1 → 1, clamp <0 → 0, parse lenient preserva summary).
    - bunx tsc --noEmit sem erros.
  </done>
</task>

</tasks>

<verification>
- `bun test src/cognition/reflection.test.ts src/llm/schemas.test.ts` passa (novos + existentes).
- `bunx tsc --noEmit` limpo.
- Revisão manual: o catch em deliberation.ts:245 não é mais acionado por priority fora de faixa (priority 10/12/8 agora passa no parse) → `summary` definido → embedding gerado → `addVector` chamado quando Chroma online.
</verification>

<success_criteria>
- ReflectionOutputSchema aceita priority fora de [0,1] sem lançar.
- applyGoalUpdates garante priority final em [0,1] (clamp).
- Pipeline de embedding/Chroma deixa de ser bloqueado por `goalUpdates[].priority`.
- Mudança cirúrgica: apenas 2 edits de produção + testes de regressão.
</success_criteria>

<output>
Após completar, criar `.planning/quick/260621-jhi-consertar-parse-lenient-do-priority-na-r/260621-jhi-SUMMARY.md`.

Commit (Conventional Commits com emoji, SEM "Generated with"/"Co-Authored-By"):
`🐛 fix(reflection): parse lenient do priority + clamp na aplicação (destrava vetor no Chroma)`
</output>
