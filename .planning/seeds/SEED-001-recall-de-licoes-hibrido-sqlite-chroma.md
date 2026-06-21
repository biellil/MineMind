---
id: SEED-001
status: dormant
planted: 2026-06-21
planted_during: v2.0 "Autonomia de Verdade" — Phase 08.1 (refatorar-memoria)
trigger_when: ao planejar/executar a Phase 14 (Aprendizado por Reflexão) — recuperação/consumo de lições no prompt
scope: medium
---

# SEED-001: Recall de lições deve ser híbrido (SQLite = verdade + reforço/decay; Chroma = índice vetorial opcional para relevância)

## Why This Matters

Quando a Phase 14 fizer o bot **consumir** lições no prompt, surge a pergunta: como escolher QUAL
lição injetar na hora certa? Há dois critérios em tensão:

- **Semântico** (vetor/KNN): "qual lição é *relevante* ao que estou fazendo agora?" — bom quando há
  MUITAS lições e você quer as relacionadas ao goal/contexto atual.
- **Estruturado** (confidence/reforço/recência): "quais são minhas lições mais *confiáveis*?" — bom
  quando há POUCAS lições e você quer sempre as de maior confiança.

O ponto-chave que diferencia lição de reflexão: **lição é atualizada o tempo todo** (`reinforce_count`,
`contradict_count`, `confidence`, `last_seen` — o "aprendizado" de verdade é o reforço/decay). Isso é
UPDATE relacional por natureza. O Chroma é ótimo para *ler* imutáveis por similaridade, mas péssimo
para ficar atualizando metadados. Logo, **não é "ou/ou"**: a fonte de verdade da lição precisa ficar no
SQLite; o vetor (se houver) é só um índice derivado descartável para recuperação por relevância —
exatamente o padrão `SQLite = verdade, Chroma = índice` que o projeto JÁ adota para `events`/reflexões.

Decisão do dev (2026-06-21): **híbrido faseado**.

## When to Surface

**Trigger:** ao planejar/executar a **Phase 14 (Aprendizado por Reflexão — loop fechado)**, especificamente
na parte de *consumo/recall* de lições no prompt.

Apresentar esta seed durante `/gsd:new-milestone` ou no planejamento da Phase 14 quando o escopo tocar:
- Recuperação de lições para injeção no prompt (`topLessons` / seção de lições no HumanMessage)
- Qualquer discussão sobre "onde as lições moram" ou "como o bot lembra o que aprendeu"
- Decisão de vetorizar (ou não) a tabela `lessons`

## Scope Estimate

**Medium** — uma fase (o coração da Phase 14: criação + consumo + recall de lições). A recomendação
faseada mantém o esforço incremental:

1. **Começar simples (SQLite puro):** recall por `confidence`/recência via `topLessons` (helper já existe
   em `src/memory/lessons.ts`, mas NUNCA é chamado hoje). Injetar top-N lições de maior confiança no
   prompt. Já entrega valor sem nenhum vetor.
2. **Vetorizar depois, SE/QUANDO o volume justificar:** adicionar 1 vetor por lição no Chroma (texto +
   confidence permanecem no SQLite; o vetor é só ponteiro para KNN). Recuperar por similaridade E filtrar/
   ordenar por confidence. Espelha a evolução que `events` já teve (primeiro relacional, depois Chroma).

Com **0 lições hoje** e volume baixo esperado (dezenas), vetorizar de início é overkill — daí o faseamento.

## Breadcrumbs

Código e decisões relacionados já no repositório:

- `src/memory/lessons.ts` — helpers `insert/reinforce/contradict/decay/topLessons` (criados na 08.1-06
  como "semente da Phase 14"; reforço/decay aritmético clampado). `topLessons` ainda **não é chamado** em
  lugar nenhum — é o gancho de consumo a ser fiado na Phase 14.
- `src/memory/lessons.test.ts` — cobertura dos helpers de lição.
- `src/memory/persistence.ts` — tabela `lessons` criada na migração v1→v2 (D-19): colunas `text`,
  `confidence`, `reinforce_count`, `contradict_count`, `last_seen`, `created_at`.
- `src/memory/longTerm.ts` — padrão de recall híbrido a espelhar: candidatos do Chroma (KNN) + scoring
  Generative Agents; fallback de recência quando o Chroma está offline (circuit breaker).
- `src/memory/chromaClient.ts` — cliente Chroma (get-or-create collection, breaker, timeout) a reusar
  caso/quando lições forem vetorizadas. Collection atual: `minemind_memory` (dim 1024, cosine).
- `src/cognition/deliberation.ts` — onde o recall semântico de reflexões já é injetado no prompt (seção
  "Memórias relevantes:"); a seção de lições seguiria padrão análogo.
- `src/llm/prompts.ts` — montagem do HumanMessage (onde a seção de lições entraria, após o mundo / antes
  do FATO VERIFICADO, análogo a "Memórias relevantes:" e "POIs próximos:").
- ROADMAP.md → "Phase 14: Aprendizado por Reflexão (loop fechado)" — Goal: lições de mortes/falhas/
  sucessos grounded influenciam observavelmente a seleção de objetivos futuros; live-verify da Fase 4
  (Known Gap v1.0) é gate de entrada.
- STATE.md → Known Gap v1.0 → gate da Phase 14 (Fase 4 não verificada ao vivo).

## Notes

- Contexto da conversa (2026-06-21): logo após aposentar a `vec_events`/`sqlite-vec` (quick 260621-lj3),
  o dev levantou "lições não deveriam ser no vetor?". A análise concluiu: o instinto está certo para
  *recuperação por relevância*, mas a lição precisa do SQLite por causa do UPDATE (reforço/decay) — daí
  o híbrido. O dev escolheu **híbrido faseado** (começa SQLite, vetoriza quando justificar).
- Arquitetura-guia do projeto: **SQLite = fonte de verdade; Chroma = índice derivado descartável.**
  Lições devem respeitar isso (verdade + decay no SQLite; vetor é só recall opcional).
- Não confundir lição (conhecimento generalizado durável, evolui por reforço/decay) com event (fato
  pontual) nem com reflexão (memória destilada vetorizada). Cada um tem seu store e seu critério de recall.
- Estado factual no momento do plantio: `lessons` vazia (0 linhas); `events`=4; 1 vetor no Chroma
  (a reflexão consolidada); `topLessons` nunca invocado.
