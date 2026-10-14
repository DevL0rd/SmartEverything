import { z } from 'zod';
import { AI_HARNESS_TARGET } from './ai-harness';
import { AI_MODEL_ROUTE } from './ai-model-route';

export const HARNESS_SUBSCRIPTION_CAPABILITY = 'harness-subscriptions-v1';
export const AI_SUBSCRIPTION_PROVIDER = z.enum(['claude', 'chatgpt', 'chatgpt-codex']);
export const HARNESS_SUBSCRIPTION_USE = z.strictObject({
  route_id: z.uuid(),
  capability_revision: z.string().min(1).max(200),
  model: z.string().min(1).max(200),
  credential_generation: z.uuid(),
});
export type HarnessSubscriptionUse = z.infer<typeof HARNESS_SUBSCRIPTION_USE>;
export const AI_SUBSCRIPTION_COMMAND = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('status') }),
  z.strictObject({ kind: z.literal('enroll') }),
  z.strictObject({
    kind: z.literal('answer'),
    enrollment_id: z.uuid(),
    answer: z.string().min(1).max(32768),
  }),
  z.strictObject({ kind: z.literal('cancel'), enrollment_id: z.uuid() }),
  z.strictObject({ kind: z.literal('disconnect') }),
]);
export const AI_SUBSCRIPTION_CONTROL = z.strictObject({
  target: AI_HARNESS_TARGET,
  provider: AI_SUBSCRIPTION_PROVIDER,
  command: AI_SUBSCRIPTION_COMMAND,
});
export const HARNESS_SUBSCRIPTION_REQUEST = z.strictObject({
  profile_id: z.uuid(),
  route_id: z.uuid(),
  provider: AI_SUBSCRIPTION_PROVIDER,
  command: AI_SUBSCRIPTION_COMMAND,
});
const SUBSCRIPTION_AUTHORIZATION_URL = z.url().refine((value) => {
  const url = new URL(value);
  const privateFields = [
    'id_token_hint',
    'id_token',
    'access_token',
    'refresh_token',
    'client_secret',
  ];
  return (
    url.username === '' &&
    url.password === '' &&
    url.hash === '' &&
    ![...url.searchParams.keys()].some((key) => privateFields.includes(key.toLowerCase()))
  );
}, 'Subscription authorization URLs must not expose stored credentials.');
export const AI_SUBSCRIPTION_INTERACTION = z.object({
  enrollment_id: z.uuid(),
  url: SUBSCRIPTION_AUTHORIZATION_URL.nullable(),
  message: z.string().max(2000),
  prompt: z.enum(['manual_code', 'text', 'select', 'device_code']).nullable(),
  options: z.array(z.object({ id: z.string(), label: z.string() })).max(20),
  user_code: z.string().max(200).nullable(),
});
export const AI_SUBSCRIPTION_HOST_STATUS = z.object({
  provider: AI_SUBSCRIPTION_PROVIDER,
  profile_id: z.uuid(),
  route_id: z.uuid(),
  state: z.enum([
    'missing_login',
    'authorizing',
    'missing_scope',
    'billing_unavailable',
    'paid_usage_enabled',
    'quota_exhausted',
    'unsupported_model',
    'ready',
    'failed',
  ]),
  message: z.string().min(1).max(2000),
  credential_generation: z.uuid().nullable(),
  account_id: z.string().max(500).nullable(),
  scopes: z.array(z.string().max(200)).max(30),
  observed_at: z.iso.datetime({ offset: true }),
  billing_checked_at: z.iso.datetime({ offset: true }).nullable(),
  billing_expires_at: z.iso.datetime({ offset: true }).nullable(),
  interaction: AI_SUBSCRIPTION_INTERACTION.nullable(),
  remote_revocation_confirmed: z.boolean().nullable(),
  route: AI_MODEL_ROUTE,
});
export type AiSubscriptionProvider = z.infer<typeof AI_SUBSCRIPTION_PROVIDER>;
export type HarnessSubscriptionRequest = z.infer<typeof HARNESS_SUBSCRIPTION_REQUEST>;
export type AiSubscriptionHostStatus = z.infer<typeof AI_SUBSCRIPTION_HOST_STATUS>;
export type AiSubscriptionInteraction = z.infer<typeof AI_SUBSCRIPTION_INTERACTION>;
