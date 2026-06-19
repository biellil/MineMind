# Retrospective: MineMind

## Milestone: v1.0 — MVP

**Shipped:** 2026-06-19
**Phases:** 5 (1–4 + backlog 999.1) | **Plans:** 24 | **LOC:** ~7.122 TS | **Testes:** 227

### What Was Built
Um agente autônomo persistente para Minecraft: conexão + percepção + skills cruas (F1), loop cognitivo cíclico sem-LLM com memória de curto prazo (F2), cognição com LLM local + necessidades/objetivos (F3), e persistência de longo prazo/semântica (SQLite + sqlite-vec), reflexão, perfis por jogador e personalidade evolutiva (F4). Backlog 999.1 resolveu o OOM do pathfinding da coleta.

### What Worked
- **Espinha sem-LLM primeiro:** provar a arquitetura do loop (F1–F2) antes de qualquer incerteza de raciocínio rendeu uma base sólida.
- **De-risking explícito (Wave 0 da F4):** validar `sqlite-vec` + `bun:sqlite` no Windows ANTES de construir a persistência evitou retrabalho de arquitetura.
- **Determinismo nos módulos sociais:** trust/personalidade movidos só por eventos verificáveis (sem LLM tocar o estado) — fronteira limpa e testável.

### What Was Inefficient
- **Testes verdes ≠ funciona ao vivo:** os 227 testes passavam, mas a verificação ao vivo expôs bugs de wiring que os unitários não cobriam (reflexão starvada, flush só no signal, thrash do socializing, LLM sem timeout, vazamento de reconexão de ~24GB). A cobertura de *integração no loop vivo* era fraca.
- **Verificação humana adiada demais:** vários bugs de runtime só apareceram no fim, num único teste ao vivo — verificar ao vivo por fase teria pego antes.
- **Traceability de requisitos não mantida** ao longo das fases (5/32 ao arquivar).

### Patterns Established
- "Reflexão reusa a deliberação single-flight, não é nó novo do StateGraph" (D-12).
- Persistência: um único arquivo SQLite (relacional + vec0), WAL, schema versionado por `PRAGMA user_version`.
- Bind de embedding: `new Float32Array(v)` direto no `bun:sqlite` (não `Buffer.from`).

### Key Lessons
- Adicionar **timeout em toda chamada de LLM** e **cap em todo loop de retry/reconexão** — sem isso, uma dependência lenta/offline trava o lock single-flight ou vaza memória sem limite.
- Para agentes de loop contínuo, **testes de contenção no loop vivo** (ação × reflexão competindo pelo lock) são tão importantes quanto os unitários.
- WAL não-checkpointed engana inspeção manual do DB — `db.close()`/checkpoint torna o estado visível no arquivo principal.

### Known Gaps carried forward
Phase 4 não-verificada ao vivo; comportamento de runtime imaturo (execução de tarefa + grounding do LLM); `[reflect]` ao vivo a confirmar. Ver `.planning/MILESTONES.md`.

## Cross-Milestone Trends

*(primeira milestone — tendências serão preenchidas a partir da v1.1.)*
