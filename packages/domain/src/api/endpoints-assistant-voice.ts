import { z } from 'zod';
import { NO_BODY, endpoint } from './endpoint';
import { NOTHING } from './primitives';

export const GEMINI_KEY_SOURCES = ['discordinator', 'aibinator'] as const;

export const GEMINI_KEY_SOURCE = z.enum(GEMINI_KEY_SOURCES);

export type GeminiKeySource = z.infer<typeof GEMINI_KEY_SOURCE>;

export const GEMINI_KEY = z.string().trim().min(20).max(200);

export const ASSISTANT_VOICE_STATUS = z.strictObject({
  key: z.enum(['set', 'missing']),
  sources: z.array(GEMINI_KEY_SOURCE),
});

export type AssistantVoiceStatus = z.infer<typeof ASSISTANT_VOICE_STATUS>;

export const ASSISTANT_VOICE_ENDPOINTS = {
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
    summary:
      'Copy the Gemini key from Discordinator or AiBinator on this computer, after checking it works',
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
