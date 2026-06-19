// src/llm/provider.ts
// LLM-01 / LLM-03 / D-18: cliente LLM abstraído por trás de uma interface de provedor.
//
// ENCAPSULAMENTO (LLM-03): ChatOpenAI vive SOMENTE aqui. A cognição depende apenas
// da interface LlmProvider — nunca importa @langchain/openai diretamente. Isso permite
// trocar LM Studio por outro backend (Ollama, nuvem) sem tocar no loop.
import { ChatOpenAI } from '@langchain/openai'
import type { BaseMessage } from '@langchain/core/messages'
import { z, type ZodType } from 'zod'
import { config } from '../config'

/**
 * Interface de provedor LLM (D-18). Três caminhos:
 *  - decide: saída ESTRUTURADA validada por schema (caminho de ação, LLM-01/02).
 *  - chat: texto livre conversacional (CHAT-02).
 *  - available: probe leve de disponibilidade para degradar graciosamente (D-17).
 */
export interface LlmProvider {
  /** Retorna um objeto que satisfaz `schema`, via structured output do modelo. */
  decide<T>(schema: ZodType<T>, messages: BaseMessage[]): Promise<T>
  /** Retorna texto livre do modelo (caminho conversacional). */
  chat(messages: BaseMessage[]): Promise<string>
  /** True se o servidor LLM responde; nunca lança (timeout/erro -> false). */
  available(): Promise<boolean>
  /** Retorna o vetor de embedding de um texto via /v1/embeddings. Lança em erro de rede/HTTP. */
  embed(text: string): Promise<number[]>
}

/** Timeout curto do probe de disponibilidade (ms). Curto para não travar o loop (T-03-03). */
const AVAILABILITY_PROBE_TIMEOUT_MS = 1500

/** Lê a baseURL do LM Studio do ambiente (default: localhost OpenAI-compatível). */
function resolveBaseUrl(): string {
  return process.env.LLM_BASE_URL || 'http://localhost:1234/v1'
}

/**
 * Cria SÓ o caminho de embedding apontado para o LM Studio local (D-11).
 * Extraído de createLmStudioProvider para que createOpenAiProvider possa DELEGAR
 * embed() a ele — embeddings ficam SEMPRE locais (custo-zero) mesmo com chat na cloud
 * (D-03/D-11). fetch direto a /v1/embeddings (Pitfall 1: o cliente de embeddings do
 * langchain trava com LM Studio — por isso NÃO o usamos aqui).
 */
export function createLocalEmbedder(baseURL: string = resolveBaseUrl()): Pick<LlmProvider, 'embed'> {
  return {
    async embed(text: string): Promise<number[]> {
      const res = await fetch(`${baseURL.replace(/\/$/, '')}/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.embeddingModel || 'text-embedding-nomic-embed-text-v1.5',
          input: text.replace(/\n/g, ' '),
        }),
      })
      if (!res.ok) throw new Error(`embeddings ${res.status}`)
      const json = (await res.json()) as { data: { embedding: number[] }[] }
      return json.data[0].embedding
    },
  }
}

/**
 * Helper compartilhado de structured output com fallback D-16.
 * 1ª tentativa: withStructuredOutput(schema zod, method:'jsonSchema'). Se lançar (caveat
 * zod v4 — langchainjs #8357, sintoma type:'None'), cai para JSON Schema cru derivado via
 * z.toJSONSchema (nativo do zod v4, preferível ao zod-to-json-schema de terceiros). Mantém
 * a decisão válida nos DOIS providers (D-17: blindagem obrigatória, não relaxável).
 * O cast a Record<string, unknown> fica confinado a este módulo (LLM-03).
 */
async function decideWithFallback<T>(
  model: ChatOpenAI,
  schema: ZodType<T>,
  messages: BaseMessage[],
): Promise<T> {
  try {
    const structured = model.withStructuredOutput(
      schema as ZodType<Record<string, unknown>>,
      { name: 'decide', method: 'jsonSchema' },
    )
    return (await structured.invoke(messages)) as T
  } catch {
    // D-16: caveat zod v4 (langchainjs #8357, sintoma type:'None'). Fallback: JSON Schema cru.
    const rawSchema = z.toJSONSchema(schema as ZodType<Record<string, unknown>>)
    const structured = model.withStructuredOutput(rawSchema as Record<string, unknown>, { name: 'decide' })
    return (await structured.invoke(messages)) as T
  }
}

/**
 * Cria um LlmProvider apontado para um servidor LM Studio (OpenAI-compatível).
 * apiKey é um literal dummy ('lm-studio') — LM Studio ignora; baseURL aponta para o
 * servidor local. Temperatura baixa por padrão favorece structured output estável
 * em modelos locais fracos (D-18).
 */
export function createLmStudioProvider(): LlmProvider {
  const baseURL = resolveBaseUrl()
  const model = new ChatOpenAI({
    model: process.env.LLM_MODEL || 'local-model',
    apiKey: 'lm-studio', // dummy; LM Studio ignora a chave
    configuration: { baseURL },
    temperature: Number(process.env.LLM_TEMPERATURE ?? 0.4),
    // Rede de segurança (D-17): sem timeout, uma geração estruturada travada no modelo local
    // segura o lock single-flight indefinidamente — mata a fome da reflexão (REFL-01) e prende o
    // bot no arbiter reativo. maxRetries baixo evita o backoff 6x default do LangChain segurando o lock.
    timeout: Number(process.env.LLM_TIMEOUT_MS ?? 20000),
    maxRetries: Number(process.env.LLM_MAX_RETRIES ?? 1),
  })

  // embed delegado ao embedder local (sem duplicar o fetch a /v1/embeddings — D-11).
  const embedder = createLocalEmbedder(baseURL)

  return {
    async decide<T>(schema: ZodType<T>, messages: BaseMessage[]): Promise<T> {
      // method:'jsonSchema' -> response_format { type:'json_schema', json_schema:{...} }
      // O fallback D-16 fica encapsulado em decideWithFallback (compartilhado com o caminho cloud).
      return decideWithFallback(model, schema, messages)
    },

    async chat(messages: BaseMessage[]): Promise<string> {
      const res = await model.invoke(messages)
      return String(res.content)
    },

    async available(): Promise<boolean> {
      // Probe LEVE via fetch ao endpoint /models (NÃO usa ChatOpenAI — evita custo de inferência).
      // Qualquer erro/timeout -> false, sem lançar (D-17: degrada para o fallback determinístico).
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), AVAILABILITY_PROBE_TIMEOUT_MS)
      try {
        const res = await fetch(`${baseURL.replace(/\/$/, '')}/models`, {
          method: 'GET',
          signal: controller.signal,
        })
        return res.ok
      } catch {
        return false
      } finally {
        clearTimeout(timer)
      }
    },

    embed: embedder.embed,
  }
}

/**
 * D-04: aplica reasoning.effort SOMENTE para modelos da família reasoning (gpt-5.x / o-series).
 * gpt-4.1-mini é família NÃO-reasoning; enviar reasoning.effort é erro (D-03/D-04) — retorna {}.
 */
function openaiModelKwargs(): Record<string, unknown> {
  if (/^(gpt-5|o\d)/.test(config.openaiModel)) {
    return { reasoning: { effort: config.openaiReasoningEffort } }
  }
  return {}
}

/**
 * Cria um LlmProvider apontado para a OpenAI cloud (GPT-4.1-mini por default — D-01).
 * Mesma classe ChatOpenAI do caminho local: só muda apiKey/model e a AUSÊNCIA de baseURL
 * (endpoint padrão OpenAI). Corte de custo via max_tokens baixo (D-02). embed() é DELEGADO
 * ao createLocalEmbedder — embeddings SEMPRE locais mesmo com chat na cloud (D-03/D-11).
 */
export function createOpenAiProvider(): LlmProvider {
  const model = new ChatOpenAI({
    model: config.openaiModel,
    apiKey: config.openaiApiKey,
    maxTokens: config.openaiMaxTokens,
    // Mesma rede de segurança do caminho local (D-17): timeout + maxRetries baixos.
    timeout: Number(process.env.LLM_TIMEOUT_MS ?? 20000),
    maxRetries: Number(process.env.LLM_MAX_RETRIES ?? 1),
    ...openaiModelKwargs(),
  })

  // D-03/D-11: embeddings nunca vão para a cloud — delega ao embedder local.
  const embedder = createLocalEmbedder()

  return {
    async decide<T>(schema: ZodType<T>, messages: BaseMessage[]): Promise<T> {
      return decideWithFallback(model, schema, messages)
    },

    async chat(messages: BaseMessage[]): Promise<string> {
      return String((await model.invoke(messages)).content)
    },

    async available(): Promise<boolean> {
      // Probe LEVE ao /models da OpenAI (NÃO inferência). Qualquer erro/timeout -> false, sem lançar.
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), AVAILABILITY_PROBE_TIMEOUT_MS)
      try {
        const res = await fetch('https://api.openai.com/v1/models', {
          method: 'GET',
          headers: { Authorization: `Bearer ${config.openaiApiKey}` },
          signal: controller.signal,
        })
        return res.ok
      } catch {
        return false
      } finally {
        clearTimeout(timer)
      }
    },

    embed: embedder.embed,
  }
}

/**
 * Factory de seleção do provider por env (D-13). Lê config.llmProvider (LLM_PROVIDER):
 * 'openai' -> cloud GPT-4.1-mini; qualquer outro -> LM Studio local (default custo-zero, D-05).
 * O caminho openai compõe createLocalEmbedder -> embed local mesmo com chat cloud (D-03/D-11).
 * Chamada 1x por sessão no loop cognitivo, substituindo a chamada direta a createLmStudioProvider.
 */
export function createProvider(): LlmProvider {
  return config.llmProvider === 'openai' ? createOpenAiProvider() : createLmStudioProvider()
}
