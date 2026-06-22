// src/chat/conversation.test.ts
// CHAT-01/02 + D-07/D-12/D-13: caminho conversacional ISOLADO do parser de controle.
// Usa provider MOCK e bot MOCK (bot.chat spy) — nenhum LLM/servidor real.
import { test, expect, mock } from 'bun:test'
import { shouldRespond, handleConversation, detectRequestKind, SUPPORTED_REQUEST_KINDS } from './conversation'
import { createCognitiveStateHolder, type CognitiveStateHolder } from '../cognition/state'
import type { LlmProvider } from '../llm/provider'

// --- helpers de mock ---
function mockProvider(reply: string | Error): LlmProvider {
  return {
    maxConcurrency: 1,
    decide: async () => ({}) as never,
    chat: async () => {
      if (reply instanceof Error) throw reply
      return reply
    },
    available: async () => true,
    embed: async () => [],
  }
}

function mockBot(username = 'MineMind'): { username: string; chat: ReturnType<typeof mock> } {
  return { username, chat: mock(() => {}) }
}

function holderWith(disposition: 'AUTONOMOUS' | 'ASSISTANT'): CognitiveStateHolder {
  const h = createCognitiveStateHolder(0)
  h.disposition = disposition
  return h
}

// --- shouldRespond (reverte D-07: responde em ambos os modos) ---
test('shouldRespond: AUTONOMOUS reactive => true (responde em ambos os modos)', () => {
  expect(shouldRespond('AUTONOMOUS', 'reactive', 'Steve', 'MineMind')).toBe(true)
})

test('shouldRespond: AUTONOMOUS proactive => true (responde em ambos os modos)', () => {
  expect(shouldRespond('AUTONOMOUS', 'proactive', 'Steve', 'MineMind')).toBe(true)
})

test('shouldRespond: ASSISTANT => true para jogador próximo (inalterado)', () => {
  expect(shouldRespond('ASSISTANT', 'reactive', 'Steve', 'MineMind')).toBe(true)
})

test('shouldRespond: ignora a própria mensagem do bot', () => {
  expect(shouldRespond('ASSISTANT', 'reactive', 'MineMind', 'MineMind')).toBe(false)
  expect(shouldRespond('AUTONOMOUS', 'proactive', 'MineMind', 'MineMind')).toBe(false)
})

// --- handleConversation: resposta ---
test('handleConversation: ASSISTANT responde via bot.chat com a reply do provider', async () => {
  const bot = mockBot()
  const holder = holderWith('ASSISTANT')
  const provider = mockProvider('Ok, indo agora.')
  await handleConversation(provider, holder, bot as never, 'Steve', 'oi', 0)
  expect(bot.chat).toHaveBeenCalledTimes(1)
  expect(bot.chat.mock.calls[0]![0]).toBe('Ok, indo agora.')
})

test('handleConversation: resposta longa é truncada (D-01 resposta curta)', async () => {
  const bot = mockBot()
  const holder = holderWith('ASSISTANT')
  const long = 'x'.repeat(500)
  const provider = mockProvider(long)
  await handleConversation(provider, holder, bot as never, 'Steve', 'oi', 0)
  const sent = bot.chat.mock.calls[0]![0] as string
  expect(sent.length).toBeLessThanOrEqual(256)
})

test('handleConversation: provider.chat que lança NÃO propaga (degrada gracioso)', async () => {
  const bot = mockBot()
  const holder = holderWith('ASSISTANT')
  const provider = mockProvider(new Error('LLM offline'))
  // não deve lançar
  await handleConversation(provider, holder, bot as never, 'Steve', 'oi', 0)
  expect(bot.chat).toHaveBeenCalledTimes(0)
})

test('handleConversation: reply vazia => não chama bot.chat', async () => {
  const bot = mockBot()
  const holder = holderWith('ASSISTANT')
  const provider = mockProvider('   ')
  await handleConversation(provider, holder, bot as never, 'Steve', 'oi', 0)
  expect(bot.chat).toHaveBeenCalledTimes(0)
})

// --- pedido -> objetivo restrito (D-13 / OQ3) ---
test('handleConversation: ASSISTANT + pedido suportado => objetivo player_request + flag', async () => {
  const bot = mockBot()
  const holder = holderWith('ASSISTANT')
  const provider = mockProvider('Vou coletar.')
  await handleConversation(provider, holder, bot as never, 'Steve', 'pode coletar madeira?', 0)
  expect(holder.playerRequestPending).toBe(true)
  const goal = holder.goals.find((g) => g.source === 'player_request')
  expect(goal).toBeDefined()
  expect(SUPPORTED_REQUEST_KINDS).toContain(goal!.kind as never)
})

test('handleConversation: ASSISTANT + pedido NÃO suportado => sem objetivo (nunca inválido)', async () => {
  const bot = mockBot()
  const holder = holderWith('ASSISTANT')
  const provider = mockProvider('Não consigo isso ainda.')
  // mensagem sem nenhuma keyword de kind suportado (gather/follow/navigate/build)
  await handleConversation(provider, holder, bot as never, 'Steve', 'que dia bonito hoje, né?', 0)
  expect(holder.playerRequestPending).toBe(false)
  expect(holder.goals.some((g) => g.source === 'player_request')).toBe(false)
  // mas ainda respondeu conversacionalmente
  expect(bot.chat).toHaveBeenCalledTimes(1)
})

test('handleConversation: AUTONOMOUS NUNCA gera objetivo de pedido (D-13)', async () => {
  const bot = mockBot()
  const holder = holderWith('AUTONOMOUS')
  const provider = mockProvider('...')
  await handleConversation(provider, holder, bot as never, 'Steve', 'pode coletar madeira?', 0)
  expect(holder.playerRequestPending).toBe(false)
  expect(holder.goals.some((g) => g.source === 'player_request')).toBe(false)
})

test('SUPPORTED_REQUEST_KINDS é o conjunto fechado gather/follow/navigate/build (OQ3 + Fase 12)', () => {
  expect([...SUPPORTED_REQUEST_KINDS].sort()).toEqual(['build', 'follow', 'gather', 'navigate'])
})

// --- Fase 12 Plan 03: kind 'build' no canal de pedido ---
test('detectRequestKind: "constrói um abrigo" => build', () => {
  expect(detectRequestKind('constrói um abrigo')).toBe('build')
})

test('detectRequestKind: "faz uma parede aqui" => build (muro/parede)', () => {
  expect(detectRequestKind('faz uma parede aqui')).toBe('build')
})

test('detectRequestKind: "build a tower" (en) => build', () => {
  expect(detectRequestKind('build a tower')).toBe('build')
})

test('detectRequestKind: variações do radical "constr" casam (construir/construa)', () => {
  expect(detectRequestKind('pode construir algo?')).toBe('build')
  expect(detectRequestKind('construa um muro')).toBe('build')
})

test('handleConversation: ASSISTANT + "constrói um abrigo" => goal id build:shelter (roteável)', async () => {
  const bot = mockBot()
  const holder = holderWith('ASSISTANT')
  const provider = mockProvider('Ok, construindo o abrigo.')
  await handleConversation(provider, holder, bot as never, 'Steve', 'constrói um abrigo', 0)
  expect(holder.playerRequestPending).toBe(true)
  const goal = holder.goals.find((g) => g.source === 'player_request')
  expect(goal).toBeDefined()
  expect(goal!.id).toBe('build:shelter')
  expect(goal!.kind).toBe('build')
})

test('handleConversation: AUTONOMOUS + "constrói um abrigo" => NÃO gera goal de build (gate ASSISTANT)', async () => {
  const bot = mockBot()
  const holder = holderWith('AUTONOMOUS')
  const provider = mockProvider('...')
  await handleConversation(provider, holder, bot as never, 'Steve', 'constrói um abrigo', 0)
  expect(holder.playerRequestPending).toBe(false)
  expect(holder.goals.some((g) => g.source === 'player_request')).toBe(false)
})
