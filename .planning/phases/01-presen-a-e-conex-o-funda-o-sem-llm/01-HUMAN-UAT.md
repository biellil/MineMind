---
status: partial
phase: 01-presen-a-e-conex-o-funda-o-sem-llm
source: [01-VERIFICATION.md]
started: 2026-06-18T00:00:00Z
updated: 2026-06-18T00:00:00Z
---

## Current Test

[aguardando teste humano com servidor Minecraft ativo]

## Tests

### 1. Smoke test de conexão (CONN-01)

expected: `bun run start` com servidor Java 1.21.4 em offline-mode deve imprimir:
- `[MineMind] Iniciando... Conectando a localhost:25565`
- `[MineMind] Online — localhost:25565 | HP: 20 | Pos: X,Y,Z`
- `[MineMind] Snapshot inicial capturado:` com campos de percepção
- `[MineMind] Snapshot imutável confirmado (Object.freeze funcionando).`
- `[MineMind] Skills registradas: navigate, dig, follow, attack`
- `[MineMind] Fase 1 completa — conexão, percepção e skills prontas.`

result: [pending]

### 2. Teste de reconexão (CONN-02)

expected: Com bot conectado, parar o servidor Minecraft. Bot deve imprimir:
- `[MineMind] Desconectado: "...". Reconectando em 5s...`
Ao reiniciar o servidor após ~5s, bot deve reconectar automaticamente e imprimir `[MineMind] Online` novamente.

result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
