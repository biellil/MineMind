# Phase 8: System 1 — Sobrevivência Reflexa - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-20
**Phase:** 08-system-1-sobreviv-ncia-reflexa
**Areas discussed:** Repertório & arbitragem, Primitivas de ação, Limiares & histerese, Fugir-vs-defender + retorno, Abrigo noturno
**Mode:** advisor (tier full_maturity; 4 agentes de pesquisa paralelos)

---

## A) Repertório & arbitragem

| Option | Description | Selected |
|--------|-------------|----------|
| Prioridade fixa (A1) | Array ordenado de guards por gravidade, winner-take-all, flag lifeCritical; função pura no driver. Canônica/determinística. | ✓ |
| A1 + commitment desde já (A2) | Anti-flapping de 1ª classe (commitmentCondition) já no v1; precisa estado entre ticks. | |
| Utility/argmax (A3) | Score 0-1, maior vence; funde perigos graduais mas scores opacos. | |
| Behavior Tree (A4) | PrioritySelector; maduro mas status≠comando + dep nova; adiar p/ Fases 9/12/13. | |

**User's choice:** Prioridade fixa (A1)
**Notes:** commitmentCondition fica diferida — só adotar sobre o A1 se flapping persistir ao vivo. Ordem de gravidade: ambiental imediato > mob > queda > fome.

---

## B) Primitivas de ação

Apresentada como recomendações por primitiva (API nativa Mineflayer, zero dep) — escolha de Claude dentro da API nativa, confirmada implicitamente.

| Primitiva | Recomendado | Alternativa |
|-----------|-------------|----------|
| Comer | equip+`consume()`+re-equip; food via mcData.foods×foodPoints; abort=`deactivateItem()` | `activateItem()`+timer manual |
| Fugir | `GoalInvert(GoalFollow(mob,R))` dynamic (não há GoalRunAway); preempt via `setGoal(null)` | sprint cego (fallback se noPath) |
| Abrigo emergência | cavar-e-tampar / pilar 1×1 (condicional); placeBlock mínimo | — |
| Perigo ambiental | sensor physicsTick `blockAt`/`oxygenLevel`; guarda de maior prioridade | — |

**User's choice:** (recomendações nativas aceitas; mecânica fina = Claude's discretion)
**Notes:** Nuance crítica capturada — preempção usa `pathfinder.setGoal(null)` (forçado), não `stop()` (gracioso).

---

## C) Limiares & histerese

| Option | Description | Selected |
|--------|-------------|----------|
| Balanceado | Fome 16/18 (default 6→16), health≤10 (survivalCritical 0.3→0.5), mob graduado (creeper10/melee8/ranged16), afogar oxygen≤6, queda>3, lava lookahead 2. Ancorado nas mecânicas reais. | ✓ |
| Conservador | Mantém defaults atuais (fome≤6, health 0.3, raio único 16). | |
| Eu ajusto os números | Definir faixas manualmente. | |

**User's choice:** Balanceado (recomendado)
**Notes:** Inclui alterar defaults do config.ts (hungryThreshold 6→16; survivalCriticalThreshold 0.3→0.5).

---

## D-A) Fronteira fugir-vs-defender

| Option | Description | Selected |
|--------|-------------|----------|
| Fuga + revidar se encurralado (D-A2) | Fuga default; 1 golpe via stub attack (sem perseguir) só sem rota. Cobre SURV-02 e o caso sem-saída. | ✓ |
| Fuga-reflexa pura (D-A1) | Nunca revida; máxima limpeza p/ re-testar [reflect], mas morre parado se encurralado. | |
| Defesa básica (D-A3) | flee-vs-fight por HP/armadura/nº mobs — "pensa" demais; é deliberação → Fase 13. | (descartada na apresentação) |

**User's choice:** Fuga + revidar se encurralado (D-A2)
**Notes:** Revidar é estritamente 1-shot sem manter alvo; combate real permanece Fase 13.

---

## D-B) Modelo de retorno ao System 2

| Option | Description | Selected |
|--------|-------------|----------|
| Re-percebe do zero + registra grounded (B1+B3) | Reflexo vira produtor de actionFinished E é registrado como MemEvent grounded p/ reflexão/Fase 14. Alinhado à arquitetura travada. | ✓ |
| Só re-percebe, sem registrar reflexo (só B1) | Re-percepção do zero mas reflexo não vira MemEvent — System 1 invisível ao aprendizado. | |
| (Retomar ação abortada — B2) | Rejeitada na apresentação: empurra continuação p/ o grafo (proibido). | |

**User's choice:** Re-percebe do zero + registra grounded (B1+B3)
**Notes:** MemEvent do reflexo debounced/coalesced p/ não inundar a memória.

---

## Abrigo noturno (follow-up)

| Option | Description | Selected |
|--------|-------------|----------|
| Só noite + ameaça (reativo) | Anoitecer sozinho NÃO abriga; só com mob/vida crítica à noite e sem rota. Abrigo proativo → Fase 12. | ✓ |
| Proativo ao anoitecer (não-crítico) | Abriga preventivamente ao cair a noite se ocioso/exposto. | |

**User's choice:** Só noite + ameaça (reativo)
**Notes:** `nightFell` agrava a resposta a mob, não é gatilho de abrigo isolado.

---

## Claude's Discretion

- Estrutura interna/nomes da função de arbitragem e guards; forma exata do SkillResult-like dos reflexos.
- Mecânica fina das primitivas nativas; escolha condicional cavar-vs-pilar em runtime.
- Valores exatos de debounce/lookahead; ordem fina de empate dentro do princípio de gravidade.
- Predicado exato de "encurralado".

## Deferred Ideas

- commitmentCondition (A2), Utility (A3), Behavior Tree (A4) — não no v1.
- placeBlock robusto → Fase 9; combate real → Fase 13; abrigo proativo/building → Fase 12.
- Re-teste AO VIVO do [reflect] — gate de verificação da fase.
