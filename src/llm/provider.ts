// src/llm/provider.ts
// LLM-01 / LLM-03 / D-18: cliente LLM abstraído por trás de uma interface de provedor.
//
// ENCAPSULAMENTO (LLM-03): ChatOpenAI vive SOMENTE aqui. A cognição depende apenas
// da interface LlmProvider — nunca importa @langchain/openai diretamente. Isso permite
// trocar LM Studio por outro backend (Ollama, nuvem) sem tocar no loop.
import { ChatOpenAI } from '@langchain/openai'
import type { BaseMessage } from '@langchain/core/messages'
import type { ZodType } from 'zod'

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

  return {
    async decide<T>(schema: ZodType<T>, messages: BaseMessage[]): Promise<T> {
      // method:'jsonSchema' -> response_format { type:'json_schema', json_schema:{...} }
      // O langchain constringe RunOutput a Record<string, any>; nossas decisões SÃO objetos,
      // mas mantemos a interface LlmProvider genérica (T livre). O cast fica confinado a este
      // módulo (LLM-03) — nenhum tipo do langchain vaza para a cognição.
      const structured = model.withStructuredOutput(
        schema as ZodType<Record<string, unknown>>,
        { name: 'decide', method: 'jsonSchema' },
      )
      return (await structured.invoke(messages)) as T
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

    async embed(text: string): Promise<number[]> {
      // Pitfall 1: fetch direto a /v1/embeddings (NÃO usar OpenAIEmbeddings — trava com LM Studio).
      // Mesma baseURL resolvida que o probe available() usa.
      const res = await fetch(`${baseURL.replace(/\/$/, '')}/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: process.env.EMBEDDING_MODEL || 'text-embedding-nomic-embed-text-v1.5',
          input: text.replace(/\n/g, ' '),
        }),
      })
      if (!res.ok) throw new Error(`embeddings ${res.status}`)
      const json = (await res.json()) as { data: { embedding: number[] }[] }
      return json.data[0].embedding
    },
  }
}
