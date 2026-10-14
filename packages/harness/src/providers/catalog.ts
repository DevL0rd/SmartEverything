import { z } from 'zod';
import { anthropicProvider } from '@earendil-works/pi-ai/providers/anthropic';
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex';
import { openaiProvider } from '@earendil-works/pi-ai/providers/openai';
import type { Api, Model, Provider } from '@earendil-works/pi-ai';
import type { SubscriptionCredential } from '../credentials/contracts';
import { SubscriptionProviderError } from './errors';
import { subscriptionJson } from '../authorization/http';

const CHATGPT_MODELS = z.object({
  models: z
    .array(
      z.object({
        slug: z.string().min(1),
        display_name: z.string().min(1),
        visibility: z.string(),
      }),
    )
    .max(1000),
});
const CLAUDE_MODELS = z.object({
  data: z.array(z.object({ id: z.string().min(1), display_name: z.string().min(1) })).max(1000),
  has_more: z.boolean().optional(),
});

export interface SubscriptionModelCatalog {
  readonly generation: string;
  readonly candidates: readonly {
    readonly id: string;
    readonly name: string;
    readonly supported: boolean;
  }[];
  readonly models: readonly Model<Api>[];
}

export function nativeSubscriptionProvider(kind: SubscriptionCredential['kind']): Provider {
  return kind === 'claude-subscription'
    ? anthropicProvider()
    : kind === 'codex-subscription'
      ? openaiCodexProvider()
      : openaiProvider();
}

export async function discoverSubscriptionModels(
  credential: SubscriptionCredential,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<SubscriptionModelCatalog> {
  const selected = nativeSubscriptionProvider(credential.kind);
  const rows =
    credential.kind === 'chatgpt-subscription'
      ? await chatgptModels(credential, signal, fetcher)
      : credential.kind === 'codex-subscription'
        ? await codexModels(credential, signal, fetcher)
        : await claudeModels(credential, signal, fetcher);
  const known = selected.getModels();
  const models = rows.flatMap((row) => {
    const native = known.find((model) => model.id === row.id);
    return native === undefined
      ? []
      : [{ ...native, provider: credential.routeId, name: row.name }];
  });
  return {
    generation: credential.generation,
    candidates: rows.map((row) => ({
      ...row,
      supported: models.some((model) => model.id === row.id),
    })),
    models,
  };
}

async function chatgptModels(
  credential: SubscriptionCredential,
  signal: AbortSignal,
  fetcher: typeof fetch,
): Promise<readonly { readonly id: string; readonly name: string }[]> {
  const result = CHATGPT_MODELS.parse(
    await subscriptionJson(fetcher, 'https://api.openai.com/v1/models', {
      signal,
      headers: { Authorization: `Bearer ${credential.access}` },
    }),
  );
  return result.models
    .filter((model) => model.visibility === 'list')
    .map((model) => ({ id: model.slug, name: model.display_name }));
}

async function claudeModels(
  credential: SubscriptionCredential,
  signal: AbortSignal,
  fetcher: typeof fetch,
): Promise<readonly { readonly id: string; readonly name: string }[]> {
  const result = CLAUDE_MODELS.parse(
    await subscriptionJson(fetcher, 'https://api.anthropic.com/v1/models?limit=1000', {
      signal,
      headers: {
        Authorization: `Bearer ${credential.access}`,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'oauth-2025-04-20',
      },
    }),
  );
  if (result.has_more === true)
    throw new SubscriptionProviderError(
      'MODEL_UNAVAILABLE',
      'Claude account model catalog is incomplete; refusing partial discovery.',
    );
  return result.data.map((model) => ({ id: model.id, name: model.display_name }));
}

async function codexModels(
  credential: SubscriptionCredential,
  signal: AbortSignal,
  fetcher: typeof fetch,
): Promise<readonly { readonly id: string; readonly name: string }[]> {
  if (credential.kind !== 'codex-subscription')
    throw new SubscriptionProviderError(
      'AUTH_INVALID',
      'Codex discovery requires its own account credential.',
    );
  const result = CHATGPT_MODELS.parse(
    await subscriptionJson(
      fetcher,
      'https://chatgpt.com/backend-api/codex/models?client_version=0.0.0',
      {
        signal,
        headers: {
          Authorization: `Bearer ${credential.access}`,
          'ChatGPT-Account-Id': credential.accountId,
        },
      },
    ),
  );
  return result.models
    .filter((model) => model.visibility === 'list')
    .map((model) => ({ id: model.slug, name: model.display_name }));
}
