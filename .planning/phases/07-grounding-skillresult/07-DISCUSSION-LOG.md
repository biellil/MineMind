# Phase 7: Grounding + SkillResult - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-19
**Phase:** 07-grounding-skillresult
**Mode:** advisor (full_maturity tier — perfil "conservative")
**Areas discussed:** Contrato do SkillResult, Mecanismo de verificação, Sucesso parcial & timeout, Fronteira de grounding (chat/memória)

---

## Contrato do SkillResult

| Option | Description | Selected |
|--------|-------------|----------|
| B + C parcial | Base flat tagueada por outcome (success/partial/no_effect/error) + tipar observed por skill só p/ dig e navigate | ✓ |
| B puro | Só base flat tagueada, observed/expected genéricos (Record) | |
| C completo | Discriminated union tipada por skill p/ as 4 skills, validada por Zod | |
| A genérico | Flat mínimo {ok, observed:Record, reason?} | |

**User's choice:** B + C parcial (recomendado)
**Notes:** `'no_effect'` captura a alucinação (Promise resolveu, nada mudou); eixo erro-vs-falha-observada central ao GRND-01; tipar observed por skill só p/ dig/navigate evita especulação nos stubs follow/attack; `expected` derivado dos params.

---

## Mecanismo de verificação

| Option | Description | Selected |
|--------|-------------|----------|
| C híbrido | captureGroundState(bot) central (espelha buildWorldSnapshot) + predicado puro evaluate() por skill; after em finally/catch | ✓ |
| B bespoke | Cada skill com verificador próprio, sem módulo central | |
| A differ central | Differ genérico único antes/depois com schema expected comum | |

**User's choice:** C híbrido (recomendado)
**Notes:** Separa captura do mundo (genérica, 1 lugar) de julgamento (dono da skill). Generaliza literalmente o progressChecker do dig. Captura do `after` em finally/catch p/ não perder delta parcial em throw.

---

## Sucesso parcial & timeout

| Option | Description | Selected |
|--------|-------------|----------|
| B ternário | failure/partial/success com observed/expected numéricos; label derivado do observed; delta capturado em finally | ✓ |
| A binário | ok=(observed>=expected); menor é falha total, observed descartado | |
| C razão contínua | progress=observed/expected (0..1) + threshold de ok | |

**User's choice:** B ternário (recomendado)
**Notes:** `observed` é fonte de verdade, label derivado. `partial` é não-sucesso (honra GRND-04: só credita tech-tree em success). Referência Voyager: parciais como sucesso contaminam skill library; binário (A) tem o perigo simétrico de apagar o progresso parcial.

---

## Fronteira de grounding (chat/memória)

| Option | Description | Selected |
|--------|-------------|----------|
| D camadas B+A+C | Memória só-observed (obrigatório) + delta autoritativo no prompt (base) + post-filter minimalista de quantidade (gate final) | ✓ |
| B + A só | Memória deriva do observed + delta no prompt, sem post-filter | |
| B só | Só corrige a memória (result derivado do delta) | |

**User's choice:** D camadas B+A+C (recomendado)
**Notes:** LLM local fraco drifta mesmo com contexto autoritativo (pesquisa confirma); A sozinho é instrução, não gate. B obrigatório/quase grátis (corrige bug de raiz em nodes.ts); A base barata (serializeContext); C gate determinístico escopado ao padrão "peguei N tábuas" (conversation.ts).

---

## Follow-ups

### Stubs follow/attack na conversão (GRND-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Retornar outcome:'error' | Stubs param de dar throw como fluxo; retornam SkillResult{outcome:'error'}; contrato uniforme | ✓ |
| Manter throw, node converte | Stubs seguem lançando; execute node captura e converte | |

**User's choice:** Retornar outcome:'error' (recomendado)
**Notes:** Toda skill SEMPRE retorna SkillResult; o catch do execute node deixa de ser caminho de fluxo normal.

### Comportamento do post-filter em divergência de quantidade

| Option | Description | Selected |
|--------|-------------|----------|
| Reescrever p/ número grounded | "peguei 10" → "peguei 3"; bot fala, mas verdade | ✓ |
| Suprimir só a afirmação | Remove a frase com a quantidade, mantém o resto | |
| Segurar a mensagem inteira | Não envia se qualquer quantidade não bate | |

**User's choice:** Reescrever p/ número grounded (recomendado)
**Notes:** Mantém a fala natural com a verdade, em vez de truncar ou silenciar o bot.

## Claude's Discretion

- Nomes exatos de tipos/campos (`SkillResult`, `GroundState`, `outcome`), organização de `grounding/`, forma do `delta`.
- Heurística de extração de quantidade pt-BR no post-filter — começar simples, iterar.

## Deferred Ideas

- Razão contínua de progresso (RL/scoring futuro).
- Union `observed` tipada p/ follow/attack (quando virarem skills reais — Fases 11/13).
- Validador semântico geral de NLG no post-filter (over-engineering).
