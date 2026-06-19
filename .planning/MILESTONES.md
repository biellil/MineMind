# Milestones

## v1.0 MVP (Shipped: 2026-06-19)

**Phases completed:** 5 phases, 24 plans, 28 tasks

**Key accomplishments:**

- sqlite-vec@0.1.9 carrega no bun:sqlite no Windows e um embedding Float32Array faz round-trip por uma tabela virtual vec0 (INSERT + KNN MATCH) — D-01 confirmada, fallback vectra descartado.
- `openDb` cria/abre um único arquivo SQLite (relacional + índice vetorial vec0) com schema versionado por `PRAGMA user_version`, WAL e recuperação graceful contra corrupção; o `LlmProvider` ganha `embed(text)` via fetch direto a `/v1/embeddings` — a fundação atômica de MEM-02/MEM-03 que todos os stores da fase consomem.
- `src/memory/longTerm.ts` implementa o coração de MEM-03: importância heurística determinística (1-10 por tipo de MemEvent), escrita atômica evento+embedding na mesma transação respeitando o piso de importância, e recuperação semântica com o scoring de Generative Agents (recência × importância × relevância, min-max [0,1], pesos iguais α=1) que renova `last_access` e degrada gracioso quando o LLM/embedding está off.
- Dois módulos puros/determinísticos que formam a "identidade social" do agente: `profiles.ts` persiste um perfil por jogador onde `trust` é um escalar movido SÓ por eventos verificáveis do Mineflayer (TRUST_DELTA, clampado [-1,1]), e `personality.ts` mantém um `PersonalityState` (mood/socialEnergy/confidence) que evolui por contadores fixos sobre uma baseline imutável e reverte à média por tempo — sem nenhum LLM/ML tocar o estado (fronteira estrutural vs ADV-01).
- REFL-01 entregue como PEÇAS puras + schema + enum: o estado `reflecting` existe no `CognitiveState` e no `PRIORITY_ORDER` (prioridade baixa, preemptível), `ReflectionOutputSchema` (Zod) restringe a saída do LLM a um resumo + deltas de objetivo, e `src/cognition/reflection.ts` implementa o gatilho híbrido (`shouldReflect`), a consolidação CP→LP atômica que roda mesmo sem LLM (`consolidate`, importância forçada alta) e a aplicação imutável dos deltas (`applyGoalUpdates`). A reflexão NÃO é um nó novo do StateGraph — o disparo via deliberação single-flight é wiring do Plan 06.
- A "mente" do agente agora sobrevive a um RESTART COMPLETO do processo (não só a reconexões): o `CognitiveStateHolder` ganha `db` + `personality`, `holder.persistence.ts` serializa o estado vivo (needs/goals/currentGoal/disposition/personality) em `kv['holder']` e o hidrata no boot com decay-on-boot (curiosity re-decai por timestamp, goals velhos descartados, personalidade revertida à baseline), e `bot/index.ts` abre o DB + hidrata 1x no boot e faz flush+close gracioso em SIGINT/SIGTERM — fechando MEM-02 no lado do estado vivo.
- 1. [Rule 3 - Blocking] DB durável de runtime não estava no .gitignore
- 1. [Rule 3 - Blocking] @ts-expect-error redundante em `bot.pathfinder.thinkTimeout`
- Smoke headless `bun:test` que prova simultaneamente os 3 critérios de D-07 sob PERCEPTION_RADIUS=32 — sem OOM (heap sob teto), rejeição dentro de digTimeoutMs, e lag de event loop < 200ms via heartbeat — em dois cenários (todos inalcançáveis e collect travado #222).

**Stats:** 145 commits · ~7.122 LOC TypeScript · 227 testes (1 fail = teste de config que lê `.env` local) · timeline 2026-06-18 → 2026-06-19.

### Known Gaps (shipped com dívida consciente — usuário optou por "completar mesmo assim")

- **Phase 4 NÃO verificada ao vivo:** o gate human-verify (Task 3 do 04-07) não passou; fase marcada concluída a pedido. `04-07-SUMMARY.md` mantém o registro honesto.
- **Comportamento de runtime imaturo:** ao vivo o bot fica no arbiter reativo (segue/vaga) sem executar tarefa real; o LLM de conversa alucina ações. Território Fase 2/3.
- **`[reflect]` ao vivo não confirmado:** B1 (starvation) e o timeout do LLM foram corrigidos, mas falta re-teste limpo ao vivo.
- **Requirements traceability não mantida:** 5/32 marcados ao arquivar; outcomes reais nos SUMMARYs.

### Fixes pós-execução (mesma sessão, antes do tag)

- `6824029` reconexão com cap (corta vazamento de ~24GB de RAM com servidor fora do ar)
- `2095271`/`3aa1376` reflexão no loop vivo (B1) + flush durável (B2)
- `0b4dc64` socializing sem re-navigate infinito
- `540966d` timeout + maxRetries no LLM (libera o lock single-flight)

---
