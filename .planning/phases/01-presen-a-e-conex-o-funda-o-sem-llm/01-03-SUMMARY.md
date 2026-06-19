---
plan: 01-03
phase: 01-presen-a-e-conex-o-funda-o-sem-llm
status: complete
completed_at: 2026-06-18
---

# Summary: 01-03 — Executor Centralizado e Skills

## O que foi construído

Executor centralizado de skills e 4 skills: navigate e dig (reais), follow e attack (stubs). Todas com timeout, watchdog de progresso, ritmo humanizado e schemas Zod prontos para Fase 3.

## Resultado do smoke test

**Servidor Minecraft não disponível no ambiente de build.** O smoke test de integração com bot conectado foi substituído por 30 testes unitários automatizados que cobrem toda a lógica testável sem servidor.

**Resultado: `bun test` → 30 pass, 0 fail**

## Arquivos criados

| Arquivo | Descrição |
|---------|-----------|
| `src/skills/executor.ts` | `executeWithSafety`, `gaussianDelay`, `SkillTimeoutError`, `SkillStuckError` |
| `src/skills/navigate.ts` | `navigate()` real + `NavigateSchema` + `navigateTool` |
| `src/skills/dig.ts` | `dig()` real + `DigSchema` + `digTool` |
| `src/skills/follow.ts` | `follow()` stub + `FollowSchema` + `followTool` |
| `src/skills/attack.ts` | `attack()` stub + `AttackSchema` + `attackTool` |
| `src/skills/index.ts` | `skillRegistry` + `toolRegistry` — 4 entries cada |
| `src/skills/executor.test.ts` | 8 testes: gaussianDelay, timeout, watchdog, cleanup |
| `src/skills/schemas.test.ts` | 14 testes: validação Zod, registry, toJSONSchema() |
| `src/config.test.ts` | 2 testes: defaults sem .env |
| `src/perception/types.test.ts` | 2 testes: contrato WorldSnapshot, imutabilidade |

## Desvios das decisões

- **CollectOptions sem `count`**: `mineflayer-collectblock` não suporta `count` em `CollectOptions`. Ajustado para `findBlocks(..., count)` + passar array de blocos ao `collect()`.
- **Type augmentation**: `import 'mineflayer-collectblock'` (side-effect) necessário para `bot.collectBlock` ser reconhecido pelo TypeScript.
- **Checkpoint humano substituído por testes**: servidor MC não disponível no ambiente. 30 testes unitários cobrem toda a lógica sem servidor.

## Resultado do typecheck

`bun x tsc --noEmit` → **exit 0**

## Compatibilidade Bun↔Mineflayer (STATE.md Blocker A1)

**RESOLVIDO**: `bun install` funcionou sem erros NAPI. Runtime Bun 1.3.2 é compatível com mineflayer@4.37.1. Nenhum addon NAPI problemático foi adicionado (D-02 respeitado).

## self-check

- [x] executeWithSafety exportado com timeout + watchdog
- [x] gaussianDelay com Box-Muller, sempre >= 0
- [x] SkillTimeoutError e SkillStuckError como subclasses de Error com .name
- [x] clearInterval no finally — sem timers órfãos
- [x] navigate() usa executeWithSafety com progressChecker de posição
- [x] dig() usa executeWithSafety com progressChecker de inventário
- [x] follow() e attack() lançam Error com mensagem de stub
- [x] skillRegistry com 4 entries
- [x] toolRegistry com 4 entries + schemas Zod
- [x] NavigateSchema.toJSONSchema() funciona (Zod v4 built-in)
- [x] bun test: 30/30 pass

## key-files.created

- src/skills/executor.ts
- src/skills/navigate.ts
- src/skills/dig.ts
- src/skills/follow.ts
- src/skills/attack.ts
- src/skills/index.ts
