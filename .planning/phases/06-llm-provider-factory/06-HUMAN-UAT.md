---
status: partial
phase: 06-llm-provider-factory
source: [06-VERIFICATION.md]
started: 2026-06-19T22:17:28Z
updated: 2026-06-19T22:17:28Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Live structured-output parity across both real providers
expected: Com LM Studio rodando + `OPENAI_API_KEY` válida + rede, o teste live (gated por `RUN_LIVE_PARITY=1`) percorre `createProvider()` em ambos os perfis e `ActionDecisionSchema.parse()` retorna saída válida nos dois — confirmando paridade real (critério de meta #2, D-15). CI nunca exercita isto por design.
result: cloud PASS (2026-06-19 — `RUN_LIVE_PARITY=1 LLM_PROVIDER=openai`, chamada real GPT-4.1-mini, parse OK); local pendente (requer LM Studio em localhost:1235)

Comandos:
```
LLM_PROVIDER=local  RUN_LIVE_PARITY=1 bun test src/llm/parity.test.ts
LLM_PROVIDER=openai OPENAI_API_KEY=... RUN_LIVE_PARITY=1 bun test src/llm/parity.test.ts
```

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

(cloud-side validado ao vivo 2026-06-19; item permanece partial até paridade local live com LM Studio)

## Gaps
