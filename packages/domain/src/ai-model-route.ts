import { z } from 'zod';
import { AI_HARNESS_TARGET, AI_HARNESS_FAILURE } from './ai-harness';
import { AI_SUBSCRIPTION_USAGE } from './ai-subscription-usage';

export const AI_MODEL_ROUTE_AUTH = z.discriminatedUnion('provider', [
  z.object({ provider: z.literal('anthropic'), kind: z.literal('claude-subscription-oauth') }),
  z.object({
    provider: z.literal('openai'),
    kind: z.enum(['chatgpt-sign-in', 'chatgpt-codex-oauth']),
  }),
  z.object({ provider: z.literal('openrouter'), kind: z.literal('hub-api-key') }),
]);
export const AI_MODEL_ROUTE_CAPABILITIES = z.object({
  revision: z.string().min(1).max(200),
  input_modalities: z
    .array(z.enum(['text', 'image', 'file']))
    .min(1)
    .max(3),
  output_modalities: z.array(z.literal('text')).min(1).max(1),
  reasoning: z.boolean(),
  efforts: z.array(z.string().min(1).max(32)).max(20),
  local_tools: z.boolean(),
  context_tokens: z.int().positive().nullable(),
  max_output_tokens: z.int().positive().nullable().optional(),
  discovered_at: z.iso.datetime({ offset: true }),
});
export type AiModelRouteCapabilities = z.infer<typeof AI_MODEL_ROUTE_CAPABILITIES>;

export const AI_MODEL_ROUTE_MODEL = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  capabilities: AI_MODEL_ROUTE_CAPABILITIES,
});
export type AiModelRouteModel = z.infer<typeof AI_MODEL_ROUTE_MODEL>;

const ROUTE_FIELDS = {
  id: z.uuid(),
  profile_id: z.uuid(),
  supplier: AI_HARNESS_TARGET,
  subscriber_id: z.string().min(1).max(200),
  auth: AI_MODEL_ROUTE_AUTH,
  billing: z.enum(['subscription-only', 'metered']),
  fallback: z.literal('none'),
  background_authorized: z.boolean(),
  credential_generation: z.uuid().optional(),
  capability_revision: z.string().min(1).max(200),
  models: z.array(AI_MODEL_ROUTE_MODEL).max(1000),
  usage: AI_SUBSCRIPTION_USAGE.optional(),
};
export const AI_MODEL_ROUTE = z
  .discriminatedUnion('state', [
    z.object({ ...ROUTE_FIELDS, state: z.literal('ready') }),
    z.object({
      ...ROUTE_FIELDS,
      state: z.literal('unavailable'),
      failure: AI_HARNESS_FAILURE,
    }),
  ])
  .superRefine((route, context) => {
    const subscription = route.auth.provider !== 'openrouter';
    if (route.billing !== (subscription ? 'subscription-only' : 'metered'))
      context.addIssue({
        code: 'custom',
        path: ['billing'],
        message: 'Billing must match the explicit provider route.',
      });
  });
export type AiModelRoute = z.infer<typeof AI_MODEL_ROUTE>;

export const AI_MODEL_ROUTE_SELECTION = z.object({
  credential_generation: z.uuid().optional(),
  route_id: z.uuid(),
  capability_revision: z.string().min(1).max(200),
  model: z.string().trim().min(1).max(200),
  effort: z.string().trim().min(1).max(32).nullable(),
});
export const AI_MODEL_ROUTE_SELECTION_WRITE = AI_MODEL_ROUTE_SELECTION.strict();
export type AiModelRouteSelection = z.infer<typeof AI_MODEL_ROUTE_SELECTION>;
