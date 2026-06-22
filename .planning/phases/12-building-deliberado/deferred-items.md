# Deferred Items — Phase 12 (building-deliberado)

Itens descobertos durante a execução que estão FORA do escopo do plano corrente (SCOPE BOUNDARY).
Não corrigidos aqui; registrados para o dono apropriado.

## Plan 12-02

### [PRÉ-EXISTENTE / FIX C] Teste DAG-router falha por trabalho não-commitado da sessão de debug `dag-router-ignores-explore`

- **Descoberto durante:** Task 2 (verificação da suíte `src/cognition/`).
- **Sintoma:** `src/cognition/nodes.test.ts` → "roteador DAG cede ao explore... > gather:oak_log SEM cooldown + LLM action=explore → roteador DAG vence (dig, comportamento padrão)" FALHA (espera `dig`, recebe `navigate`).
- **Causa-raiz:** a árvore de trabalho tinha alterações NÃO-COMMITADAS em `src/cognition/nodes.ts` e `src/cognition/nodes.test.ts` (status `M` já no início da sessão) implementando "FIX C" da sessão de debug `.planning/debug/dag-router-ignores-explore.md` (status: `verifying`). FIX C muda `dagRouterYieldsToExplore` de `dagTargetCooledDown && llmWantsEscape` para apenas `llmWantsEscape`. O teste "SEM cooldown" ainda afirma o comportamento ANTIGO (escape exige cooldown), tornando-se stale com FIX C.
- **Prova de que NÃO é regressão deste plano:** com as mudanças de `states.ts` (12-02) revertidas, o teste continua falhando. Com TODAS as mudanças não-commitadas (FIX C) revertidas, o teste passa. O plano 12-02 (commits `78dc3bd`, `4403b46`) foi commitado ISOLADO de FIX C e está 100% verde (`bun test src/cognition/` → 167 pass / 0 fail; `tsc --noEmit` limpo).
- **Owner:** sessão de debug `dag-router-ignores-explore` (atualizar `nodes.test.ts` para refletir o novo contrato do escape do FIX C, OU reverter FIX C). NÃO é trabalho do Phase 12.
- **Estado:** FIX C permanece na árvore de trabalho como mudança não-commitada (`M nodes.ts`, `M nodes.test.ts`), preservada para a sessão de debug concluir.
