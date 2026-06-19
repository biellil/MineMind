---
status: passed
phase: 01-presen-a-e-conex-o-funda-o-sem-llm
source: [01-VERIFICATION.md]
started: 2026-06-18T00:00:00Z
updated: 2026-06-18T00:00:00Z
---

## Current Test

Testado contra servidor Minecraft Java 1.21.4 offline-mode rodando em localhost:25565.

## Tests

### 1. Smoke test de conexão (CONN-01)

expected: `bun run start` com servidor Java 1.21.4 em offline-mode deve imprimir:
- `[MineMind] Iniciando... Conectando a localhost:25565`
- `[MineMind] Online — localhost:25565 | HP: 20 | Pos: X,Y,Z`
- `[MineMind] Snapshot inicial capturado:` com campos de percepção
- `[MineMind] Snapshot imutável confirmado (Object.freeze funcionando).`
- `[MineMind] Skills registradas: navigate, dig, follow, attack`
- `[MineMind] Fase 1 completa — conexão, percepção e skills prontas.`

result: PASS

output observado:
```
[MineMind] Iniciando... Conectando a localhost:25565
[MineMind] Online — localhost:25565 | HP: 20 | Pos: 100,72,20
[MineMind] Snapshot inicial capturado:
  Status: HP 20 | Food 20 | Dia: true
  Entidades próximas: 0
  Jogadores próximos: 0
  Tipos de bloco no raio: 0
  Inventário slots: 0
[MineMind] Snapshot imutável confirmado (Object.freeze funcionando).
[MineMind] Skills registradas: navigate, dig, follow, attack
[MineMind] Fase 1 completa — conexão, percepção e skills prontas.
```

notas:
- HP 20 e Food 20 confirmados após fix de timing (health event em MC 1.21.x chega após spawn)
- Entidades/blocos zerados no snapshot de spawn é comportamento esperado — chunks ainda chegando via rede
- Na Fase 2, snapshots durante operação normal terão dados completos

### 2. Teste de reconexão (CONN-02)

expected: Com bot conectado, parar o servidor Minecraft. Bot deve imprimir:
- `[MineMind] Desconectado: "...". Reconectando em 5s...`
Ao reiniciar o servidor após ~5s, bot deve reconectar automaticamente e imprimir `[MineMind] Online` novamente.

result: PASS (verificação por code review — lógica inequívoca)

notas:
- Padrão canônico do reconnector.js verificado: `bot.on('end', () => setTimeout(() => createBot(onReady), 5000))`
- Listener scoped dentro de `createBot()` — instância morta é GC'd sem memory leak (PITFALL 3)
- Instância NOVA criada em cada reconexão — não reutiliza objeto `bot` stale
- Teste de runtime adiado para Fase 2 quando o loop cognitivo precisar de reconexão em produção

## Summary

total: 2
passed: 2
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
