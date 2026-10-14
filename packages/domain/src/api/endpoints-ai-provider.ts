import {
  AI_RUNTIME_ENGINE_CATALOGUE,
  AI_CHAT_RUNTIME_PROVIDER,
  AI_RUNTIME_ENGINE_PREFERENCE,
} from '../ai-runtime-provider';
import { COMPUTER_AI_RUNTIME } from '../computer-ai-runtime';
import { CODEX_PROVIDER_CONTROL, CODEX_PROVIDER_READ_QUERY } from '../node/runtime-provider';
import { CODEX_ANSWER } from '../codex-prompts';
import { z } from 'zod';
import { AI_CHAT_PROVIDER, AI_ENGINE_CATALOGUE, AI_ENGINE_PREFERENCE } from '../ai-provider';
import { AI_ENGINE_DEFAULT, AI_ENGINE_DEFAULT_CHANGE } from '../ai-chats';
import { PROVIDER_CONTROL, PROVIDER_READ_QUERY } from '../node/provider-controls';
import { PROVIDER_ANSWER } from '../node/provider-turns';
import { JSON_VALUE } from '../values';
import { endpoint, NO_BODY } from './endpoint';
import { DONE, ID, NOTHING } from './primitives';
const CHAT = z.strictObject({ chatId: ID });
export const AI_PROVIDER_ENDPOINTS = {
  readAiEngineCatalogue: endpoint({
    method: 'GET',
    path: '/api/ai/engines',
    access: 'member',
    summary:
      'AI engine defaults, supplying computers, discovered subscription models and saved model machine choices',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.union([AI_RUNTIME_ENGINE_CATALOGUE, AI_ENGINE_CATALOGUE]),
  }),
  updateAiRuntimeEnginePreference: endpoint({
    method: 'PUT',
    path: '/api/ai/engines/:runtime/preferences/:modelId',
    access: 'owner',
    summary: 'Save the supplying computer for one runtime and model',
    params: z.strictObject({ runtime: COMPUTER_AI_RUNTIME, modelId: z.string().min(1).max(200) }),
    query: NOTHING,
    body: z.strictObject({ device_id: ID }),
    response: AI_RUNTIME_ENGINE_PREFERENCE,
  }),
  readAiEngineDefault: endpoint({
    method: 'GET',
    path: '/api/ai/engines/default',
    access: 'member',
    summary:
      'The full AI engine default for new chats and background work; null follows OpenRouter settings',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: AI_ENGINE_DEFAULT,
  }),
  updateAiEngineDefault: endpoint({
    method: 'PUT',
    path: '/api/ai/engines/default',
    access: 'owner',
    summary:
      'Choose the full default engine, including the supplying computer and supported native options',
    params: NOTHING,
    query: NOTHING,
    body: AI_ENGINE_DEFAULT_CHANGE,
    response: AI_ENGINE_DEFAULT,
  }),
  updateAiEnginePreference: endpoint({
    method: 'PUT',
    path: '/api/ai/engines/preferences/:modelId',
    access: 'owner',
    summary: 'Save the explicit supplying computer for one native subscription model',
    params: z.strictObject({ modelId: z.string().min(1).max(200) }),
    query: NOTHING,
    body: z.strictObject({ device_id: ID }),
    response: AI_ENGINE_PREFERENCE,
  }),
  readAiChatProvider: endpoint({
    method: 'GET',
    path: '/api/ai/chats/:chatId/provider',
    access: 'member',
    summary:
      'Read this chat’s separate subscription session, prompts, runtime metadata and provider events',
    params: CHAT,
    query: NOTHING,
    body: NO_BODY,
    response: z.union([AI_CHAT_RUNTIME_PROVIDER, AI_CHAT_PROVIDER]),
  }),
  readAiChatProviderState: endpoint({
    method: 'POST',
    path: '/api/ai/chats/:chatId/provider/read',
    access: 'member',
    summary:
      'Read supported subscription context, tasks, MCP status and chat-owned session details',
    params: CHAT,
    query: NOTHING,
    body: z.union([
      PROVIDER_READ_QUERY,
      z.strictObject({ runtime: z.literal('codex'), query: CODEX_PROVIDER_READ_QUERY }),
    ]),
    response: JSON_VALUE,
  }),
  controlAiChatProvider: endpoint({
    method: 'POST',
    path: '/api/ai/chats/:chatId/provider/control',
    access: 'member',
    summary:
      'Control this chat’s subscription model, native settings, tasks, MCP and session lifecycle',
    params: CHAT,
    query: NOTHING,
    body: z.union([
      PROVIDER_CONTROL,
      z.strictObject({ runtime: z.literal('codex'), control: CODEX_PROVIDER_CONTROL }),
    ]),
    response: JSON_VALUE,
  }),
  answerAiChatProvider: endpoint({
    method: 'POST',
    path: '/api/ai/chats/:chatId/provider/prompts/:promptId',
    access: 'member',
    summary:
      'Answer an exact pending permission, question, plan or elicitation prompt of this chat’s provider',
    params: CHAT.extend({ promptId: z.string().min(1).max(200) }),
    query: NOTHING,
    body: z.union([
      PROVIDER_ANSWER,
      z.strictObject({ runtime: z.literal('codex'), answer: CODEX_ANSWER }),
    ]),
    response: DONE,
  }),
} as const;
