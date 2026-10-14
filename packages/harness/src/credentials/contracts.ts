import { z } from 'zod';
import { CODEX_IDENTITY_CANDIDATE } from './codex-identity';

const SECRET = z.string().min(1).max(32768);
export const CLAUDE_ACCOUNT_IDENTITY = z.strictObject({
  accountId: z.uuid(),
  organizationId: z.uuid(),
});
export type ClaudeAccountIdentity = z.infer<typeof CLAUDE_ACCOUNT_IDENTITY>;
export const SUBSCRIPTION_ROUTE_ID = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const BASE = {
  routeId: SUBSCRIPTION_ROUTE_ID,
  hostId: z.uuid(),
  generation: z.uuid(),
  access: SECRET,
  refresh: SECRET,
  expires: z.number().int().positive(),
  subscriberProfileId: z.uuid().optional(),
};
export const CLAUDE_SUBSCRIPTION_CREDENTIAL = z.strictObject({
  ...BASE,
  kind: z.literal('claude-subscription'),
  access: SECRET.startsWith('sk-ant-oat01-'),
  identity: CLAUDE_ACCOUNT_IDENTITY.optional(),
});
export const CHATGPT_SUBSCRIPTION_CREDENTIAL = z.strictObject({
  ...BASE,
  kind: z.literal('chatgpt-subscription'),
  access: SECRET.refine((token) => !token.startsWith('sk-'), 'API keys are forbidden.'),
  clientId: z
    .string()
    .min(1)
    .max(500)
    .refine((id) => id !== 'dynamic_agent_client'),
  issuer: z.literal('https://auth.openai.com'),
  subject: z.string().min(1).max(500),
  idToken: SECRET,
  scopes: z.array(z.string().min(1)).max(30),
  email: z.string().max(500).optional(),
  earliestRefreshAt: z.number().int().nonnegative().optional(),
});
export const CODEX_SUBSCRIPTION_CREDENTIAL = z.strictObject({
  ...BASE,
  kind: z.literal('codex-subscription'),
  access: SECRET.refine((token) => !token.startsWith('sk-'), 'API keys are forbidden.'),
  accountId: z.string().min(1).max(500),
  identityCandidate: CODEX_IDENTITY_CANDIDATE.optional(),
});
export type CodexSubscriptionCredential = z.infer<typeof CODEX_SUBSCRIPTION_CREDENTIAL>;
export const SUBSCRIPTION_CREDENTIAL = z.discriminatedUnion('kind', [
  CLAUDE_SUBSCRIPTION_CREDENTIAL,
  CHATGPT_SUBSCRIPTION_CREDENTIAL,
  CODEX_SUBSCRIPTION_CREDENTIAL,
]);
export type SubscriptionCredential = z.infer<typeof SUBSCRIPTION_CREDENTIAL>;
export const SUBSCRIPTION_CREDENTIAL_READER = z.discriminatedUnion('kind', [
  CLAUDE_SUBSCRIPTION_CREDENTIAL.strip().extend({
    identity: CLAUDE_ACCOUNT_IDENTITY.strip().optional(),
  }),
  CHATGPT_SUBSCRIPTION_CREDENTIAL.strip(),
  CODEX_SUBSCRIPTION_CREDENTIAL.strip().extend({
    identityCandidate: CODEX_IDENTITY_CANDIDATE.strip().optional(),
  }),
]);
export type ClaudeSubscriptionCredential = z.infer<typeof CLAUDE_SUBSCRIPTION_CREDENTIAL>;
export type ChatgptSubscriptionCredential = z.infer<typeof CHATGPT_SUBSCRIPTION_CREDENTIAL>;
export const CHATGPT_REGISTRATION = CHATGPT_SUBSCRIPTION_CREDENTIAL.pick({
  routeId: true,
  hostId: true,
  clientId: true,
  issuer: true,
  subject: true,
});
export type ChatgptRegistration = z.infer<typeof CHATGPT_REGISTRATION>;

export interface SubscriptionStorage {
  read(key: string): Promise<unknown>;
  write(key: string, value: unknown, signal?: AbortSignal): Promise<void>;
  remove(key: string): Promise<void>;
  exclusive<T>(operation: () => Promise<T>): Promise<T>;
  routes?(): Promise<readonly string[]>;
  watch(listener: (key: string) => void): () => void;
}
