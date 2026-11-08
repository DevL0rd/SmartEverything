import { z } from 'zod';
import { NO_BODY, endpoint } from './endpoint';
import { NOTHING, knownResponseStrings } from './primitives';
import { VOICE_SAMPLE, VOICE_SAMPLE_PARAMS } from '../voice-preview';

export * from '../voice-preview';

export const GEMINI_KEY_SOURCES = ['aibinator'] as const;

export const GEMINI_KEY_SOURCE = z.enum(GEMINI_KEY_SOURCES);

export type GeminiKeySource = z.infer<typeof GEMINI_KEY_SOURCE>;

export const GEMINI_KEY = z.string().trim().min(20).max(200);

export const ASSISTANT_VOICE_STATUS = z.strictObject({
  key: z.enum(['set', 'missing']),
  sources: knownResponseStrings(GEMINI_KEY_SOURCE),
});

export type AssistantVoiceStatus = z.infer<typeof ASSISTANT_VOICE_STATUS>;

export const CHAT_VOICE_REPLY = z.strictObject({
  operationId: z.uuid().optional(),
  text: z.string().trim().min(1).max(1000).describe('Exactly what to say in the voice message'),
  quoteMessageId: z
    .uuid()
    .optional()
    .describe(
      'A message in this chat, from chat_read, to quote as the one this voice message replies to',
    ),
});

export type ChatVoiceReply = z.output<typeof CHAT_VOICE_REPLY>;

const CHAT_VOICE_RECEIPT = z.strictObject({
  chatId: z.uuid(),
  messageId: z.uuid(),
  attachmentId: z.uuid(),
});

export type ChatVoiceReceipt = z.output<typeof CHAT_VOICE_RECEIPT>;

export const ASSISTANT_VOICE_ENDPOINTS = {
  postChatVoiceReply: endpoint({
    method: 'POST',
    path: '/api/assistant/voice/reply',
    access: 'member',
    summary: 'Generate and send one voice message in the current AI chat',
    params: NOTHING,
    query: NOTHING,
    body: CHAT_VOICE_REPLY,
    response: CHAT_VOICE_RECEIPT,
  }),
  readAssistantVoiceSample: endpoint({
    method: 'GET',
    path: '/api/assistant/voice/samples/:voice',
    access: 'owner',
    summary: 'A short Gemini Live sample (WAV) of one call voice, generated once and then kept',
    params: VOICE_SAMPLE_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: VOICE_SAMPLE,
  }),
  readAssistantVoice: endpoint({
    method: 'GET',
    path: '/api/assistant/voice',
    access: 'member',
    summary:
      'Whether the voice assistant has a Gemini key, and which apps on this computer have one to import',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: ASSISTANT_VOICE_STATUS,
  }),
  importGeminiKey: endpoint({
    method: 'POST',
    path: '/api/assistant/voice/key/import',
    access: 'owner',
    summary: 'Copy the Gemini key from AiBinator on this computer, after checking it works',
    params: NOTHING,
    query: NOTHING,
    body: z.strictObject({ source: GEMINI_KEY_SOURCE }),
    response: ASSISTANT_VOICE_STATUS,
  }),
  setGeminiKey: endpoint({
    method: 'PUT',
    path: '/api/assistant/voice/key',
    access: 'owner',
    summary: 'Save a Gemini API key for the voice assistant, after checking it works',
    params: NOTHING,
    query: NOTHING,
    body: z.strictObject({ key: GEMINI_KEY }),
    response: ASSISTANT_VOICE_STATUS,
  }),
  removeGeminiKey: endpoint({
    method: 'DELETE',
    path: '/api/assistant/voice/key',
    access: 'owner',
    summary: 'Forget the voice assistant’s Gemini key',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: ASSISTANT_VOICE_STATUS,
  }),
} as const;
