import { AI_SUBSCRIPTION_USAGE } from './ai-subscription-usage';
import { z } from 'zod';
import { ENGINE } from './ai-chats';
import { CLAUDE_PROVIDER_OPTIONS, COMPUTER_AI_MODEL } from './computer-ai';
import { PROVIDER_EVENT } from './node/provider-turns';
import { PROVIDER_METADATA } from './node/provider-controls';
import { JSON_VALUE } from './values';

export const AI_ENGINE_CAPABILITY = 'computer-ai-v1';
export const AI_ENGINE_HEADER = 'accept';
export const AI_ENGINE_CAPABILITIES_HEADER = 'x-smarteverything-ai-capabilities';
export const AI_ENGINE_HEADER_VALUE = 'application/json; smarteverything-ai-engines=computer-v1';
export const AI_ENGINE_PREFERENCE = z.strictObject({
  model: z.string().min(1).max(200),
  device_id: z.uuid(),
});
export const AI_ENGINE_CATALOGUE = z.strictObject({
  default: ENGINE.nullable(),
  computers: z.array(
    z.strictObject({
      device_id: z.uuid(),
      name: z.string(),
      online: z.boolean(),
      enabled: z.boolean(),
      provider_options: CLAUDE_PROVIDER_OPTIONS,
      reason: z.string().nullable(),
      models: z.array(COMPUTER_AI_MODEL),
    }),
  ),
  preferences: z.array(AI_ENGINE_PREFERENCE),
});
export type AiEngineCatalogue = z.infer<typeof AI_ENGINE_CATALOGUE>;
export const AI_PROVIDER_PROMPT = z.strictObject({
  id: z.string().min(1).max(200),
  kind: z.string().min(1).max(100),
  request: z.record(z.string(), JSON_VALUE),
  status: z.enum(['pending', 'answered', 'expired']),
});
export const AI_CHAT_PROVIDER = z.strictObject({
  subscription_usage: AI_SUBSCRIPTION_USAGE.optional(),
  device_id: z.uuid(),
  session_id: z.string().nullable(),
  job_id: z.uuid().nullable(),
  state: z.enum(['idle', 'working', 'completed', 'failed']),
  reason: z.string().nullable(),
  metadata: PROVIDER_METADATA.nullable(),
  prompts: z.array(AI_PROVIDER_PROMPT),
  events: z.array(PROVIDER_EVENT),
});
export type AiChatProvider = z.infer<typeof AI_CHAT_PROVIDER>;

export const AI_CHAT_PROVIDER_NOTICE = z.strictObject({
  type: z.literal('ai_chat_provider'),
  chat_id: z.uuid(),
  device_id: z.uuid(),
  job_id: z.uuid(),
  event: PROVIDER_EVENT,
});
export type AiChatProviderNotice = z.infer<typeof AI_CHAT_PROVIDER_NOTICE>;
