import { z } from 'zod';
import type { ComputerRuntimeCapabilities } from '@smarteverything/domain';
import { ACCOUNT } from './protocol';
import { CodexRuntimeError } from './errors';
import type { CodexClient } from './client';
import { readRateLimits, requireSubscriptionBilling } from './rate-limits';
import { THREAD_REPLY } from './protocol';
const MANAGED_CHATGPT_BASE_URL = 'https://chatgpt.com/backend-api/';
const CONFIG = z.object({
  config: z.object({
    model_provider: z.literal('openai'),
    forced_login_method: z.enum(['chatgpt', 'api']).nullable(),
    openai_base_url: z.null().optional(),
    chatgpt_base_url: z.literal(MANAGED_CHATGPT_BASE_URL).nullable().optional(),
    model_providers: z.record(z.string(), z.unknown()).optional(),
  }),
});
export interface CodexAuthentication {
  readonly authentication: ComputerRuntimeCapabilities['authentication'];
  readonly subscription: ComputerRuntimeCapabilities['subscription'];
}
export async function requireSubscription(
  client: CodexClient,
  cwd?: string,
): Promise<CodexAuthentication> {
  const parsedConfig = CONFIG.safeParse(
    await client.request('config/read', {
      includeLayers: false,
      ...(cwd === undefined ? {} : { cwd }),
    }),
  );
  if (
    !parsedConfig.success ||
    parsedConfig.data.config.forced_login_method === 'api' ||
    parsedConfig.data.config.model_providers?.['openai'] !== undefined
  )
    throw new CodexRuntimeError(
      'account',
      'Only the built-in managed ChatGPT Codex route is supported; custom endpoints and metered credentials are refused.',
    );
  const account = ACCOUNT.parse(await client.request('account/read', { refreshToken: false }));
  if (account.account?.type !== 'chatgpt' || !account.requiresOpenaiAuth)
    throw new CodexRuntimeError(
      'account',
      'Sign in to the official Codex CLI with ChatGPT on this computer; API-key, other and unknown accounts cannot supply subscription models.',
    );
  return { authentication: 'chatgpt', subscription: 'eligible' };
}
export async function requireSubscriptionInference(
  client: CodexClient,
  cwd: string,
): Promise<void> {
  await requireSubscription(client, cwd);
  requireSubscriptionBilling(await readRateLimits(client));
}
export async function requireThreadSubscriptionInference(
  client: CodexClient,
  threadId: string,
): Promise<void> {
  const thread = THREAD_REPLY.parse(
    await client.request('thread/read', { threadId, includeTurns: false }),
  ).thread;
  if (thread.modelProvider !== 'openai')
    throw new CodexRuntimeError(
      'account',
      'Only native threads using the built-in ChatGPT Codex provider can receive subscription input.',
    );
  await requireSubscriptionInference(client, thread.cwd);
}
