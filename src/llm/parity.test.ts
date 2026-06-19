// src/llm/parity.test.ts
// PROV-04: paridade de structured output entre LM Studio local e GPT-4.1-mini cloud.
//
// Duas camadas:
//  (1) schema-only (D-14) — roda no CI, SEM rede. Afirma que o JSON Schema derivado de
//      ActionDecisionSchema tem type:'object'. A regressão do caveat zod v4 (langchainjs
//      #8357) produz type:'None'/ausente; este teste sozinho pega a regressão zod v4 ↔
//      withStructuredOutput sem custo de rede, antes que ela quebre silenciosamente um
//      só provider.
//  (2) live gated (D-15) — NUNCA roda no CI. Gated por RUN_LIVE_PARITY=1 via test.skipIf.
//      Percorre o provider efetivo do ambiente (createProvider lê LLM_PROVIDER) pela mesma
//      interface LlmProvider.decide e faz ActionDecisionSchema.parse() na saída real.
//
// Rodar antes de release (CI nunca seta RUN_LIVE_PARITY):
//   LLM_PROVIDER=local RUN_LIVE_PARITY=1 bun test src/llm/parity.test.ts
//   LLM_PROVIDER=openai OPENAI_API_KEY=... RUN_LIVE_PARITY=1 bun test src/llm/parity.test.ts
import { test, expect } from 'bun:test'
import { z } from 'zod'
import { ActionDecisionSchema } from './schemas'
import { createProvider } from './provider'
import { HumanMessage } from '@langchain/core/messages'

// (1) D-14 — schema-only, custo-zero, roda no CI. NÃO depende de createProvider nem de rede.
test('JSON Schema de ActionDecisionSchema tem type:object (detecta caveat zod v4 #8357)', () => {
  // z.toJSONSchema é nativo do zod v4. O caveat #8357 quebra a derivação e produz
  // type:'None'/ausente; aqui exigimos 'object'. Este teste sozinho pega a regressão
  // zod v4 ↔ withStructuredOutput SEM custo de rede.
  const json = z.toJSONSchema(ActionDecisionSchema) as Record<string, unknown>
  expect(json.type).toBe('object') // a regressão #8357 produz type:'None'/ausente
  expect(json.properties).toBeDefined()
  // o enum de ação precisa estar presente no schema derivado (paridade de contrato)
  expect((json.properties as Record<string, unknown>).action).toBeDefined()
})

// (2) D-15 — paridade live, gated por RUN_LIVE_PARITY. CI nunca o aciona.
const LIVE = !!process.env.RUN_LIVE_PARITY

test.skipIf(!LIVE)(
  'paridade live: o provider efetivo (local|openai) produz ActionDecision parseável',
  async () => {
    // createProvider() seleciona o provider por LLM_PROVIDER (sem db -> sem cap). O dev
    // roda a suíte uma vez por provider, setando LLM_PROVIDER antes de cada rodada.
    const provider = createProvider()
    const messages = [new HumanMessage('Decida sua próxima ação. Responda só JSON.')]
    const out = await provider.decide(ActionDecisionSchema, messages)
    expect(() => ActionDecisionSchema.parse(out)).not.toThrow()
  },
)
