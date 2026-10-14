import { AI_SUBSCRIPTION_USAGE } from './ai-subscription-usage';
import { z } from 'zod';
import { ENGINE } from './ai-chats';
import { COMPUTER_RUNTIME_NATIVE_EVENT } from './node/ai-frames-v2';
import {
  COMPUTER_RUNTIME_STATUS,
  COMPUTER_AI_RUNTIME,
  COMPUTER_RUNTIME_MODEL,
  COMPUTER_RUNTIME_CAPABILITIES,
  PROVIDER_EXECUTION_CONTEXT,
} from './computer-ai-runtime';
import { CLAUDE_PROVIDER_OPTIONS } from './computer-ai';
import { CODEX_PROVIDER_OPTIONS, CODEX_LIFECYCLE } from './codex';
import { CODEX_PROMPT } from './codex-prompts';
import { AI_CHAT_PROVIDER } from './ai-provider';
import { CODEX_PROVIDER_EVENT, CODEX_PROVIDER_METADATA } from './node/runtime-provider';

export const AI_ENGINE_CAPABILITY_V2 = 'computer-ai-v2';
export const AI_ENGINE_HEADER_VALUE_V2 = 'application/json; smarteverything-ai-engines=computer-v2';
export const AI_RUNTIME_ENGINE_PREFERENCE = z.strictObject({
  runtime: COMPUTER_AI_RUNTIME,
  model: z.string().min(1).max(200),
  device_id: z.uuid(),
});
export type AiRuntimeEnginePreference = z.infer<typeof AI_RUNTIME_ENGINE_PREFERENCE>;
const COMPUTER = {
  device_id: z.uuid(),
  name: z.string(),
  online: z.boolean(),
  enabled: z.boolean(),
  reason: z.string().nullable(),
  models: z.array(COMPUTER_RUNTIME_MODEL),
  capabilities: COMPUTER_RUNTIME_CAPABILITIES,
};
export const AI_RUNTIME_ENGINE_CATALOGUE = z.strictObject({
  default: ENGINE.nullable(),
  computers: z.array(
    z.discriminatedUnion('runtime', [
      z.strictObject({
        ...COMPUTER,
        runtime: z.literal('claude'),
        provider_options: CLAUDE_PROVIDER_OPTIONS,
      }),
      z.strictObject({
        ...COMPUTER,
        runtime: z.literal('codex'),
        provider_options: CODEX_PROVIDER_OPTIONS,
      }),
    ]),
  ),
  preferences: z.array(AI_RUNTIME_ENGINE_PREFERENCE),
});
export type AiRuntimeEngineCatalogue = z.infer<typeof AI_RUNTIME_ENGINE_CATALOGUE>;
export const AI_CHAT_CODEX_PROVIDER = z.strictObject({
  subscription_usage: AI_SUBSCRIPTION_USAGE.optional(),
  runtime: z.literal('codex'),
  device_id: z.uuid(),
  session_id: z.string().nullable(),
  job_id: z.uuid().nullable(),
  state: CODEX_LIFECYCLE,
  reason: z.string().nullable(),
  metadata: CODEX_PROVIDER_METADATA.nullable(),
  prompts: z.array(CODEX_PROMPT).max(500),
  events: z.array(CODEX_PROVIDER_EVENT).max(200),
  context: PROVIDER_EXECUTION_CONTEXT.nullable(),
});
export const AI_CHAT_RUNTIME_PROVIDER = z.discriminatedUnion('runtime', [
  AI_CHAT_PROVIDER.extend({
    runtime: z.literal('claude'),
    context: PROVIDER_EXECUTION_CONTEXT.nullable().default(null),
  }),
  AI_CHAT_CODEX_PROVIDER,
]);
export type AiChatRuntimeProvider = z.infer<typeof AI_CHAT_RUNTIME_PROVIDER>;
export const AI_CHAT_RUNTIME_PROVIDER_NOTICE = z.strictObject({
  type: z.literal('ai_chat_runtime_provider'),
  chat_id: z.uuid(),
  device_id: z.uuid(),
  profile_id: z.uuid(),
  runtime: z.literal('codex'),
  job_id: z.uuid(),
  event: CODEX_PROVIDER_EVENT,
});
export const COMPUTER_RUNTIME_STATUS_NOTICE = z.strictObject({
  type: z.literal('computer_runtime_status'),
  status: COMPUTER_RUNTIME_STATUS,
});
export const COMPUTER_RUNTIME_NATIVE_NOTICE = z.strictObject({
  type: z.literal('computer_runtime_native'),
  device_id: z.uuid(),
  payload: COMPUTER_RUNTIME_NATIVE_EVENT,
});
