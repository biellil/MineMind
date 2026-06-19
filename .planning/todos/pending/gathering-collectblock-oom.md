---
id: gathering-collectblock-oom
created: 2026-06-19
phase_origin: 02
severity: high
suggested: /gsd-debug
---

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
