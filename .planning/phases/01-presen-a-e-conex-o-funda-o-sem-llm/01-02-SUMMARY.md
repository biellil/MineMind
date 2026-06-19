---
plan: 01-02
phase: 01-presen-a-e-conex-o-funda-o-sem-llm
status: complete
completed_at: 2026-06-18
---

# Summary: 01-02 — Conexão e Percepção

## O que foi construído

Camada de conexão (CONN-01, CONN-02) e percepção (PERC-01 a PERC-04): bot conecta ao servidor Minecraft Java local, mantém-se vivo com reconexão automática, e expõe snapshot imutável do estado do mundo.

## Resultado do teste de conexão

**Não testado com servidor ativo** — servidor Minecraft local não disponível no ambiente de build. O teste de smoke será realizado no checkpoint do Plano 03. TypeCheck valida que a estrutura de código é correta.

## Resultado do typecheck

`bun x tsc --noEmit` → **exit 0** (zero erros de tipo)

Nota: Dois erros de tipo corrigidos durante a implementação:
1. `@ts-expect-error` removido (cast via `unknown` já era suficiente)
2. `p.displayName.toString()` adicionado (tipo `ChatMessage`, não `string`, no Mineflayer)

## Arquivos criados

| Arquivo | Descrição |
|---------|-----------|
| `src/bot/connection.ts` | `createBot()` com reconexão automática, offline-mode, pathfinder |
| `src/bot/index.ts` | Entry point — demonstra percepção e verifica imutabilidade |
| `src/perception/snapshot.ts` | `buildWorldSnapshot(bot)` — snapshot imutável (structuredClone + Object.freeze) |

## Decisões de implementação

- `bot.on('end', ...)` scoped dentro de `createBot()` — evita memory leak (PITFALL 3)
- `count: 200` em `bot.findBlocks()` — limita carga no event loop (PITFALL 4)
- `displayName: p.displayName?.toString()` — ChatMessage → string correto
- `structuredClone(raw)` antes de `Object.freeze(...)` — garantia de cópia profunda (D-10)

## Desvios das decisões

Nenhum. Todas as decisões D-05, D-07 a D-10 seguidas conforme especificado.

## self-check

- [x] createBot() exportado com BotReadyCallback
- [x] auth: 'offline' (D-05)
- [x] bot.on('end') dentro de createBot() — sem memory leak
- [x] pathfinder carregado no 'spawn' com Movements configurados
- [x] buildWorldSnapshot exportado com assinatura correta
- [x] structuredClone + Object.freeze na ordem correta (D-10)
- [x] Raio configurável via config.perceptionRadius (D-07)
- [x] count: 200 para limitar findBlocks (PITFALL 4)
- [x] TypeScript compila sem erros

## key-files.created

- src/bot/connection.ts
- src/bot/index.ts
- src/perception/snapshot.ts
