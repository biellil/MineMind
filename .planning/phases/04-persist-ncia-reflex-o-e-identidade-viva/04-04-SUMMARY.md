---
phase: 04-persist-ncia-reflex-o-e-identidade-viva
plan: 04
subsystem: social-identity
tags: [profiles, trust, personality, deterministic, sqlite, pure-module, no-llm, soc-01, soc-02]

# Dependency graph
requires:
  - phase: 04
    plan: 02
    provides: "openDb + tabela players (username PK, interactions, trust REAL, ...) — substrato dos perfis"
provides:
  - "src/social/profiles.ts — perfis por jogador: upsertPlayer (ON CONFLICT), applyTrustEvent (TRUST_DELTA fixo, clamp [-1,1]), getProfile (SOC-01/D-15/D-16)"
  - "src/cognition/personality.ts — PersonalityState + defaultPersonality + applyEventToPersonality + decayPersonality (SOC-02/D-14)"
  - "Fronteira estrutural: trust e personalidade são 100% determinísticos — nenhum LLM/ML os calcula"
affects: [04-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Trust como escalar determinístico: só TRUST_DELTA (kinds tipados) o move; clamp [-1,1] no próprio SQL (max(?, min(?, trust + ?)))"
    - "TrustEventKind = keyof typeof TRUST_DELTA — tipagem fecha a porta a strings livres/LLM (fronteira estrutural D-15)"
    - "PersonalityState: módulo PURO (tempo por parâmetro, sem Date.now, sem provider/LLM); deltas fixos + mean-reversion sem ultrapassar baseline"
    - "upsert via INSERT ... ON CONFLICT(username) DO UPDATE com players.interactions + 1 e COALESCE display_name"

key-files:
  created:
    - src/social/profiles.ts
    - src/social/profiles.test.ts
    - src/cognition/personality.ts
    - src/cognition/personality.test.ts
  modified: []

key-decisions:
  - "interactions incrementado com `players.interactions + 1` (qualificado) em vez de `interactions + 1` para evitar ambiguidade de coluna no contexto ON CONFLICT"
  - "Clamp de trust feito no SQL (não em JS) — uma única UPDATE atômica, sem read-modify-write"
  - "decayPersonality usa revertToward (clamp na baseline) em vez de fórmula exponencial — garante convergência exata à baseline sem overshoot e simplifica os testes determinísticos"
  - "Comentário do personality.ts evita os literais 'provider'/'LlmProvider'/'openai' para satisfazer o critério de aceitação que faz grep textual da ausência de LLM"

requirements-completed: [SOC-01, SOC-02]

# Metrics
duration: ~10min
completed: 2026-06-19
---

# Phase 4 Plan 04: Identidade Social (perfis + personalidade) Summary

**Dois módulos puros/determinísticos que formam a "identidade social" do agente: `profiles.ts` persiste um perfil por jogador onde `trust` é um escalar movido SÓ por eventos verificáveis do Mineflayer (TRUST_DELTA, clampado [-1,1]), e `personality.ts` mantém um `PersonalityState` (mood/socialEnergy/confidence) que evolui por contadores fixos sobre uma baseline imutável e reverte à média por tempo — sem nenhum LLM/ML tocar o estado (fronteira estrutural vs ADV-01).**

## Performance

- **Duration:** ~10 min
- **Tasks:** 2 (ambas TDD: RED → GREEN)
- **Files modified:** 4 (4 criados, 0 modificados)

## Accomplishments

- **`profiles.ts` (Task 1 — SOC-01/D-15/D-16):** `upsertPlayer` cria a linha na primeira visão (interactions=1, trust=0, first_seen=last_seen=now) e, em revisões, incrementa interactions e atualiza last_seen via `ON CONFLICT(username) DO UPDATE` (first_seen imutável, display_name preservado por COALESCE). `applyTrustEvent` move trust por um delta FIXO de `TRUST_DELTA` clampado em [-1,1] direto no SQL; `TrustEventKind` impede qualquer string livre/LLM. `getProfile` mapeia snake_case → camelCase ou retorna undefined.
- **`personality.ts` (Task 2 — SOC-02/D-14):** `defaultPersonality` devolve a baseline neutra `{ mood:0, socialEnergy:1, confidence:0.5 }`. `applyEventToPersonality` aplica deltas determinísticos por `MemEvent` (damage −0.15 mood; action success +0.05 mood/confidence; action failure −0.08 confidence; transição→socializing −0.1 socialEnergy), imutável e com todos os campos clampados nos ranges. `decayPersonality` faz mean-reversion por minuto (mood→0, confidence→0.5, sem ultrapassar) e recarrega socialEnergy (+0.01/min), tolerando elapsed ≤ 0.
- **Fronteira estrutural garantida:** nenhum dos dois módulos importa provider/LLM; `personality.ts` é puro (tempo por parâmetro). Verificado por grep textual + typecheck.
- **Suíte completa verde:** 198 pass / 0 fail (26 arquivos); `bun run typecheck` exit 0.

## Assinaturas exatas (exportadas — o Plan 05 importa estas)

```typescript
// src/social/profiles.ts
export const TRUST_DELTA: {
  readonly gaveItem: 0.2; readonly helped: 0.1; readonly attacked: -0.4;
  readonly stole: -0.3; readonly interaction: 0.01
}
export type TrustEventKind = keyof typeof TRUST_DELTA  // 'gaveItem'|'helped'|'attacked'|'stole'|'interaction'
export interface PlayerProfile {
  username: string; displayName: string | null; firstSeen: number; lastSeen: number
  interactions: number; trust: number; notes: string | null
}
export function upsertPlayer(db: Database, username: string, now: number, displayName?: string): void
export function applyTrustEvent(db: Database, username: string, kind: TrustEventKind): void
export function getProfile(db: Database, username: string): PlayerProfile | undefined

// src/cognition/personality.ts
export interface PersonalityState { mood: number; socialEnergy: number; confidence: number; updatedAt: number }
export function defaultPersonality(now: number): PersonalityState
export function applyEventToPersonality(p: PersonalityState, e: MemEvent, now: number): PersonalityState
export function decayPersonality(p: PersonalityState, now: number): PersonalityState
```

## Decisions Made

- **`interactions = players.interactions + 1` (coluna qualificada).** Dentro de `ON CONFLICT DO UPDATE`, `interactions + 1` cru é ambíguo; qualificar com `players.` deixa a intenção explícita e portável.
- **Clamp de trust no SQL.** `UPDATE ... trust = max(?, min(?, trust + ?))` é uma única operação atômica — sem read-modify-write em JS, sem corrida.
- **`decayPersonality` = revert-toward com clamp na baseline** (não decaimento exponencial). Garante convergência EXATA à baseline após tempo grande, sem overshoot, e mantém os testes determinísticos triviais. Taxas: 0.02/min para mood/confidence, 0.01/min de recarga de socialEnergy.
- **Comentário evita literais de LLM.** O critério de aceitação faz grep textual de `provider`/`LlmProvider`/`openai` no arquivo; o comentário foi reescrito ("sem qualquer LLM") para que a ausência seja inequívoca.

## Deviations from Plan

None — plano executado exatamente como escrito. As assinaturas, os deltas e os ranges seguem o esboço do PLAN.md sem alterações de design. (Único ajuste cosmético: reescrita de um comentário em personality.ts para não conter o literal "provider", alinhando ao critério de aceitação por grep — não é desvio de comportamento.)

## Known Stubs

None. Ambos os módulos são funcionais e completos. A INJEÇÃO no prompt da personalidade e o DISPARO de `applyTrustEvent`/`applyEventToPersonality` por eventos reais do Mineflayer são wiring deliberadamente alocado ao Plan 05 (conforme o objetivo do plano), não stubs deste plano.

## Next Phase Readiness

- **SOC-01 e SOC-02 prontos como módulos puros/determinísticos.** O Plan 05 pode: (a) chamar `upsertPlayer`/`applyTrustEvent` nos handlers de eventos do Mineflayer, (b) persistir/reidratar `PersonalityState` via `kvSet`/`kvGet`, e (c) injetar mood/confidence/trust no prompt (colorindo a PERSONA_BASE, sem substituí-la).
- **Próximo plano da fila:** 04-05.

## Self-Check: PASSED

- FOUND: src/social/profiles.ts
- FOUND: src/social/profiles.test.ts
- FOUND: src/cognition/personality.ts
- FOUND: src/cognition/personality.test.ts
- FOUND: commit 9220020 (test profiles), 30c602e (feat profiles)
- FOUND: commit 11aeef8 (test personality), d486c13 (feat personality)
- VERIFIED: `bun test src/social/profiles.test.ts src/cognition/personality.test.ts` → 17 pass / 0 fail
- VERIFIED: `bun test` (suíte completa) → 198 pass / 0 fail
- VERIFIED: `bun run typecheck` → exit 0
- VERIFIED: personality.ts NÃO contém `provider`/`LlmProvider`/`openai` (grep textual limpo)

---
*Phase: 04-persist-ncia-reflex-o-e-identidade-viva*
*Completed: 2026-06-19*
