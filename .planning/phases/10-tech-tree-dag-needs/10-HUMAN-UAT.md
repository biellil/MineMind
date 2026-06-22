---
status: partial
phase: 10-tech-tree-dag-needs
source: [10-VERIFICATION.md]
started: 2026-06-21T23:00:00-03:00
updated: 2026-06-21T23:00:00-03:00
---

## Current Test

[aguardando teste humano]

## Tests

### 1. Progressão madeira→pedra→ferro end-to-end ao vivo
expected: Iniciar o agente com inventário vazio em servidor Minecraft; o loop completo (need urgente → resolveDag → roteador → skills → grounding) deve produzir `iron_pickaxe` ou progressão equivalente sem intervenção humana.
result: [pending]

### 2. Needs reordenam prioridade dinamicamente em runtime
expected: Com urgência de `resources` acima do `goalThreshold`, o `holder.currentGoal` deve mudar para um sub-goal do DAG no próximo tick do observe — sem consultar LLM.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
