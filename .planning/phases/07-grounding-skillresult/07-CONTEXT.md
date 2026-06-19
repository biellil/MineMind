# Phase 7: Grounding + SkillResult - Context

**Gathered:** 2026-06-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Toda skill passa a retornar um `SkillResult` cujo veredito deriva de um **delta real observado** no mundo (inventário/posição/bloco/entidade antes-depois), nunca da resolução da Promise. As 4 skills existentes (navigate/dig/follow/attack) são convertidas para esse contrato, e o agente passa a relatar no chat e gravar na memória **apenas o que o delta confirma** — eliminando a alucinação "peguei 10 tábuas" que corromperia a tech-tree (Fase 10) e o aprendizado (Fase 14).

**Dentro do escopo:** o tipo `SkillResult`, o mecanismo de captura/julgamento do delta, a classificação de resultados parciais/timeout, e a fronteira de grounding que restringe chat/memória ao observado.

**Fora do escopo (outras fases):** implementação real de combate/follow (stubs aqui só ganham o contrato), placeBlock/craft/smelt grounded (Fase 9), System 1 reflexo (Fase 8), tech-tree DAG (Fase 10).
</domain>

<decisions>
## Implementation Decisions

### Contrato do SkillResult (GRND-01, GRND-03)
- **D-01:** Base **flat tagueada por outcome** — `{ outcome: 'success' | 'partial' | 'no_effect' | 'error', observed, expected, delta, reason? }`. O `outcome` é um discriminante string-literal (narra em `switch`), idiomático com o `MemEvent` (já union por `type`).
  - `'no_effect'` é a categoria que captura exatamente a alucinação: a Promise resolveu mas o mundo não mudou.
  - `'error'` = exceção lançada; distinto de `'partial'`/`'no_effect'` (falhas observadas). Esse eixo erro-vs-falha-observada é central ao GRND-01.
- **D-02:** Tipar `observed` **por skill** (discriminated union + Zod) **apenas para dig e navigate** (as skills reais). follow/attack ficam no shape base genérico enquanto stubs — não tipar `observed` especulativamente para elas. Evolução natural para union completa quando virarem skills reais.
- **D-03:** `expected` é **derivado dos params** da skill (ex: `count` do dig, coordenada-alvo do navigate), para que `outcome:'partial'` seja computável por comparação `observed` vs `expected`.

### Mecanismo de verificação (GRND-01, GRND-03)
- **D-04:** Abordagem **híbrida** — uma captura genérica central `captureGroundState(bot)` (inventário + posição + bloco-alvo + entidade) reaproveitando o padrão imutável de `buildWorldSnapshot` (`perception/snapshot.ts`), MAIS um predicado/avaliador **puro por skill** `evaluate(before, after, params): SkillResult` que decide "observed satisfaz expected?".
  - Separa as duas responsabilidades hoje fundidas: *captura do mundo* (1 lugar, genérico) vs *julgamento de sucesso* (dono de cada skill, semântica própria).
  - O `evaluate` puro `(before, after) → SkillResult` é trivial de testar sem mock de bot.
  - Generaliza literalmente o `progressChecker` do dig (`dig.ts:68` soma inventário; `navigate.ts:59` hash de posição) — o snapshot numérico vira parte do `GroundState`.
- **D-05:** Novo módulo `grounding/` (ex: `grounding/capture.ts` + `grounding/types.ts`) abriga a captura central e o tipo `GroundState`. Não inflar `executeWithSafety` com isso.

### Sucesso parcial & timeout (GRND-01, GRND-04)
- **D-06:** Classificação **ternária quantificada** — `failure | partial | success` com `observed` e `expected` **numéricos** no resultado/memória. O `observed` é a **fonte de verdade**; o label é *derivado* dele (nunca o contrário).
- **D-07:** `partial` é uma categoria **não-sucesso**. A tech-tree (Fase 10) só credita conclusão em `success` (`observed >= expected`) — honra GRND-04 ("observed não satisfaz expected → falha") sem jogar fora o número real do progresso parcial.
- **D-08:** Capturar o delta **mesmo quando a ação lança** mid-progresso — ler o `after` num `finally`/`catch`, não depois do `await` que pode rejeitar. Mecanismo: anexar `observed` ao próprio erro (`err.observed`) para o catch do execute node ler, OU a skill ler baseline antes e delta no `finally`. Assim um `SkillTimeoutError` que coletou 3/10 reporta `observed:3`, não falha total.

### Fronteira de grounding — chat/memória (GRND-02)
- **D-09:** Defesa em camadas **B + A + C**, com prioridades claras (sem over-engineering por camada):
  - **(B) Memory-level — OBRIGATÓRIO e quase grátis:** o `result`/`outcome` gravado na memória deriva do `observedDelta` real, não do no-throw. Corrige o bug de raiz em `nodes.ts` (hoje `result:'success'` = "não lançou"). Torna a memória *estruturalmente incapaz* de lembrar falsidade e protege a memória longa (SQLite+sqlite-vec, Fase 4) de contaminação permanente.
  - **(A) Prompt-level — base barata:** injetar o `observedDelta` no `serializeContext` (`prompts.ts`) como fato autoritativo ("isto é o que de fato aconteceu; narre só a partir disto"). Reduz a taxa de drift do LLM, mas sozinho é instrução, não gate.
  - **(C) Post-filter — gate determinístico final:** reconciliar afirmações de **quantidade/coleta** da fala do LLM contra o `observedDelta` recente, no único ponto de saída (`conversation.ts`, antes do `bot.chat`). Começar **minimalista** — escopado ao padrão "peguei N tábuas" que o critério #3 mede, NÃO um validador semântico geral de NLG.
- **D-10:** Ao detectar divergência de quantidade, o post-filter **reescreve para o número grounded** (ex: "peguei 10" → "peguei 3"). O bot continua falando, mas com a verdade. (Alternativas suprimir/segurar foram descartadas — reescrever mantém a fala natural.)
- **D-11:** Justificativa para as 3 camadas: o LLM local fraco *drifta* mesmo com contexto autoritativo (pesquisa confirma "default to hallucinating rationalizations"), então A sozinho não satisfaz o critério #3 ("centenas de ações sem 'peguei 10 tábuas'"). Ordem de implementação sugerida: B+A primeiro (estruturais, baratos, corrigem a raiz), depois C escopado.

### Conversão das skills (GRND-03)
- **D-12:** Os stubs follow/attack **param de dar throw como fluxo** e retornam `SkillResult{ outcome:'error', reason:'não implementado' }`. Contrato uniforme: **toda skill SEMPRE retorna SkillResult**; o execute node nunca depende de `catch` para fluxo normal (catch fica só para exceções genuínas inesperadas, que viram `outcome:'error'`).
- **D-13:** Estender o `MemEvent` action (`cognition/types.ts:20`) de `result:'success'|'failure'` para carregar `outcome` + `observed`/`expected`. O TS estrito força todos os consumidores downstream a tratar o caso `partial` explicitamente (vantagem em projeto de pesquisa de design limpo). Migrar os testes que assertam `result:'success'`.

### Claude's Discretion
- Nomes exatos de campos/tipos (`SkillResult`, `GroundState`, `outcome` vs `verdict`), organização de arquivos dentro de `grounding/`, e a forma precisa do `delta` (Record vs tipado) ficam a critério do planner/executor, respeitando D-01..D-13.
- Heurística de extração de quantidade no post-filter (regex pt-BR de "peguei/coletei N <item>") — começar simples, iterar.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Especificação da fase
- `.planning/ROADMAP.md` §"Phase 7: Grounding + SkillResult" — goal, depends-on (Fase 6), 4 success criteria.
- `.planning/REQUIREMENTS.md` — GRND-01 (SkillResult por delta real), GRND-02 (relata só o confirmado), GRND-03 (converter navigate/dig/follow/attack), GRND-04 (observed≠expected → falha).

### Código a converter / estender (núcleo da fase)
- `src/skills/executor.ts` — `executeWithSafety<T>` + `progressChecker` (snapshot numérico antes/depois) + `SkillTimeoutError`/`SkillStuckError`; o `try/finally` (~L104-117) é onde o `after`/delta deve ser capturado (D-08).
- `src/skills/dig.ts` §L63-72 — `progressChecker` de inventário a generalizar; skill real a tipar `observed` (D-02).
- `src/skills/navigate.ts` §L54-66 — `progressChecker` de posição; skill real a tipar `observed` (D-02).
- `src/skills/follow.ts`, `src/skills/attack.ts` — stubs que hoje dão throw; converter para retornar `SkillResult{outcome:'error'}` (D-12).
- `src/cognition/nodes.ts` §L218-229 — execute node; **ponto exato do bug** (grava `result:'success'` na resolução da Promise). Passa a consumir `SkillResult` e derivar memória do delta (D-09 B).
- `src/cognition/types.ts` §L18-20 — `MemEvent` (discriminated union por `type`); variante `action` a estender com `outcome`/`observed`/`expected` (D-13).

### Padrões a reaproveitar
- `src/perception/snapshot.ts` — `buildWorldSnapshot` (objeto imutável via clone+freeze) — padrão de captura a espelhar em `captureGroundState` (D-04).
- `src/perception/types.ts` — `WorldSnapshot.inventory` (slot-a-slot) — fonte do `observedDelta` de inventário.
- `src/llm/prompts.ts` — `serializeContext` (já serializa "Eventos recentes") — ponto de injeção do delta autoritativo (D-09 A).
- `src/chat/conversation.ts` — única saída de fala antes do `bot.chat` — ponto do post-filter (D-09 C / D-10).

Sem ADRs/specs externos — os requisitos estão totalmente capturados nas decisões acima e nos arquivos canônicos do código.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `executeWithSafety<T>` já retorna `T` (não `void`) e já tem `progressChecker` — a espinha do delta já existe, só precisa estruturar o snapshot e capturar before/after.
- `buildWorldSnapshot` (`perception/snapshot.ts`) — padrão de captura imutável a reusar em `captureGroundState`.
- `MemEvent` já é discriminated union por `type` — estender a variante `action` é idiomático (Zod v4 já em uso para schemas).
- `serializeContext` (`prompts.ts`) já injeta eventos recentes — slot natural para o delta autoritativo.

### Established Patterns
- Single-flight no execute node (D-02 da Fase 2): uma skill por vez, aguardada, resultado gravado no holder — o `SkillResult` flui por aqui.
- Validação Zod no início de cada skill (`.parse()`) — custo de validação por tick já pago; validar `observed` por skill não adiciona overhead relevante.
- Skills se auto-embrulham em `executeWithSafety` (999.1 D-06) — sem wrap externo no node.

### Integration Points
- `skillRegistry[skill](bot, params)` em `nodes.ts:220` passa a retornar `SkillResult` (assinatura das skills muda de `Promise<void>` → `Promise<SkillResult>`).
- O catch do execute node deixa de ser caminho de fluxo normal (D-12) — stubs retornam erro em vez de lançar.
- A memória longa (Fase 4) e a reflexão (Fase 14) consomem o `observed` numérico — manter o número, não só o label.
</code_context>

<specifics>
## Specific Ideas

- Bug-âncora a matar: "peguei 10 tábuas" quando o inventário não mudou — o `outcome:'no_effect'` é desenhado especificamente para esse caso.
- Critério #3 é medido AO VIVO ("centenas de ações"): o post-filter (C) é a rede que fecha o gap que o prompt (A) sozinho deixa com LLM local fraco.
- Referência conceitual: self-verification do Voyager — parciais classificados como sucesso *contaminam* a skill library; o perigo simétrico (parciais apagados como falha total) também é evitado pelo ternário (D-06).
</specifics>

<deferred>
## Deferred Ideas

- **Razão contínua de progresso (`observed/expected` com threshold)** — útil se surgir uma fase de scoring/RL contínuo; derivável de `observed`/`expected` sob demanda. Fora do escopo da Fase 7 (F10 quer inteiros de inventário, F14 é binário grounded).
- **Union `observed` tipada para as 4 skills** — adotar quando follow/attack virarem skills reais (Fases 11/13). Aqui só dig/navigate (D-02).
- **Validador semântico geral de NLG no post-filter** — over-engineering; manter C escopado ao padrão de quantidade/coleta (D-09 C).

None — discussão ficou dentro do escopo da fase (nenhum todo pendente relevante a Phase 7 além do já resolvido `gathering-collectblock-oom`).
</deferred>

---

*Phase: 07-grounding-skillresult*
*Context gathered: 2026-06-19*
