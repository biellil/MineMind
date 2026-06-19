---
id: gathering-collectblock-oom
created: 2026-06-19
phase_origin: 02
severity: high
suggested: /gsd-debug
status: resolved
resolved: 2026-06-19
resolved_by: 999.1
---

## ✓ Resolvido na Fase 999.1 (2026-06-19)

Fix proper implementado e verificado (7/7 must-haves):
- **D-03** (`connection.ts`): bounds do A* (`searchRadius=48`/`thinkTimeout=2000`) nos globais E em `bot.collectBlock.movements` → reativa o gate `maxCost` (raiz do OOM).
- **D-01** (`config.ts`/`dig.ts`): "raio de busca de coleta" (`gatherSearchRadius=16`) separado do "raio de percepção" (`perceptionRadius=32`).
- **D-04/D-05** (`dig.ts`): pré-check síncrono `getPathTo` filtra alvos inalcançáveis antes de `collect()` (evita hang #222) → falha alimenta cooldown por-tipo.
- **D-06** (`nodes.ts`): double-wrap de `executeWithSafety` removido.
- **D-07** (`dig.oom.smoke.test.ts`): smoke headless prova sem-OOM + rejeita-dentro-do-timeout + event-loop responsivo (lag<200ms) sob `PERCEPTION_RADIUS=32`.

Workaround `PERCEPTION_RADIUS=8` removido — `.env`/`.env.example` voltam a 32.

# Bug: collectBlock estoura memória (OOM kill) no estado Gathering

## Sintoma
Ao entrar em `gathering`, `bot.collectBlock.collect()` dispara o A* do
mineflayer-pathfinder que cresce a memória do processo `bun` para ~78 GB de
VM / ~3,9 GB RSS, sendo morto pelo OOM killer do kernel (SIGKILL). O bloqueio
é síncrono, então a rede de segurança (timeouts/watchdog do executor) NÃO
dispara — viola a propriedade central da Fase 2 ("o loop nunca trava").

## Evidência
```
Out of memory: Killed process (bun) total-vm:78694960kB anon-rss:3910128kB global_oom
```
Descoberto na verificação humana ao vivo do Plano 02-04 (2026-06-19).

## Workaround atual (local, não-committado)
`.env` PERCEPTION_RADIUS=8 (era 32). Raio menor → busca A* menor → cabe na
memória. O agente sobrevive e o gathering roda. Mas degrada a percepção e não
é o fix real.

## Fix proper (a investigar via /gsd-debug)
- Bound o pathfinding do collectBlock: thinkTimeout/maxIterations no Movements,
  ou validar alcançabilidade antes de coletar.
- Revisar dupla-embalagem em nodes.ts:129 (executeWithSafety sem progressChecker
  envolvendo um skill que já se auto-embrulha) — o timeout externo não protege
  contra bloqueio síncrono do event loop.
- Considerar default de PERCEPTION_RADIUS menor OU separar "raio de percepção"
  do "raio de busca de coleta".
