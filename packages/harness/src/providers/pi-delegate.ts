import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai';
import type { PiAiAdapterOptions, ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai';
import { resolveRetryPolicy, attributionHeaders } from '@deepseek-ai/dsh-llm';
import { lazyStream } from '@earendil-works/pi-ai/api/lazy';
import type {
  AssistantMessageEvent,
  Provider,
  OAuthAuth,
  TranscriptContext,
  SimpleStreamOptions,
} from '@earendil-works/pi-ai';
import type { SubscriptionCredential } from '../credentials/contracts';
import type { SubscriptionModelCatalog } from './catalog';
import { nativeSubscriptionProvider } from './catalog';
import { frozenSubscriptionAuth } from './frozen-auth';
import { subscriptionResponsesPayload, subscriptionResponsesEvent } from './responses-payload';
import { SubscriptionProviderError } from './errors';
import manifest from '../../package.json' with { type: 'json' };

const STREAM_IDLE_TIMEOUT_MS = 300000;
const MAX_REQUEST_IMAGE_BYTES = 20 * 1024 * 1024;
export const REQUEST_IMAGE_PIXEL_BUDGET = 2048 * 2048;
export const REQUEST_IMAGE_MAX_BYTES = 1024 * 1024;
const APP_IDENTITY = {
  product: 'smarteverything',
  version: manifest.version,
  url: 'https://github.com/DevL0rd/SmartEverything',
};

export type SubscriptionAttachmentOptions = Pick<
  PiAiAdapterOptions,
  'resolveAttachments' | 'resolveImageAccess' | 'onReplayDegrade'
>;

export function subscriptionPiDelegate(
  record: SubscriptionCredential,
  catalog: SubscriptionModelCatalog,
  attachments: SubscriptionAttachmentOptions,
  fetcher: typeof fetch = fetch,
): PiAiAdapter {
  const frozen = frozenSubscriptionAuth(record);
  const native = nativeSubscriptionProvider(record.kind);
  const provider = routeProvider({ record, catalog, oauth: frozen.oauth, fetcher });
  const profile: ResolvedPiAiProviderProfile = {
    provider: record.routeId,
    displayName: native.name,
    piProvider: provider,
    streamIdleTimeoutMs: STREAM_IDLE_TIMEOUT_MS,
    maxRequestImageBytes: MAX_REQUEST_IMAGE_BYTES,
    requestImagePixelBudget: REQUEST_IMAGE_PIXEL_BUDGET,
    requestImageMaxBytes: REQUEST_IMAGE_MAX_BYTES,
    retryPolicy: resolveRetryPolicy(undefined, record.routeId),
    modelErrors: new Map(),
    configuredMaxTokens: new Map(),
  };
  const profiles = new Map([[record.routeId, profile]]);
  return new PiAiAdapter({
    profiles: () => profiles,
    resolveApiKey: () => Promise.resolve(undefined),
    auth: {
      credentials: frozen.store,
      authContext: {
        env: () => Promise.resolve(undefined),
        fileExists: () => Promise.resolve(false),
      },
    },
    ...attachments,
  });
}

function routeProvider(input: {
  readonly record: SubscriptionCredential;
  readonly catalog: SubscriptionModelCatalog;
  readonly oauth: OAuthAuth;
  readonly fetcher: typeof fetch;
}): Provider {
  const { record, catalog, oauth, fetcher } = input;
  const native = nativeSubscriptionProvider(record.kind);
  return {
    id: record.routeId,
    name: native.name,
    baseUrl: subscriptionBaseUrl(record.kind),
    auth: { oauth },
    getModels: () => catalog.models,
    stream: (): never => {
      throw new SubscriptionProviderError(
        'CAPABILITY_UNAVAILABLE',
        'Subscription inference must pass through the typed DSH simple-stream adapter.',
      );
    },
    streamSimple: (model, context, options) =>
      lazyStream(model, () =>
        Promise.resolve(
          routeEvents(
            native.streamSimple(
              {
                ...model,
                provider: native.id,
                baseUrl: subscriptionBaseUrl(record.kind),
              },
              wireContext(context, record.routeId, native.id),
              subscriptionStreamOptions(record, options, fetcher),
            ),
            record.routeId,
          ),
        ),
      ),
  };
}

function wireContext(
  context: TranscriptContext,
  routeId: string,
  nativeId: string,
): TranscriptContext {
  return {
    ...context,
    messages: context.messages.map((message) =>
      message.role === 'assistant' && message.provider === routeId
        ? { ...message, provider: nativeId }
        : message,
    ),
  };
}

async function* routeEvents(
  stream: AsyncIterable<AssistantMessageEvent>,
  routeId: string,
): AsyncIterable<AssistantMessageEvent> {
  for await (const event of stream) {
    if (event.type === 'done') yield { ...event, message: { ...event.message, provider: routeId } };
    else if (event.type === 'error')
      yield { ...event, error: { ...event.error, provider: routeId } };
    else yield { ...event, partial: { ...event.partial, provider: routeId } };
  }
}

function subscriptionBaseUrl(kind: SubscriptionCredential['kind']): string {
  return kind === 'claude-subscription'
    ? 'https://api.anthropic.com'
    : kind === 'codex-subscription'
      ? 'https://chatgpt.com/backend-api'
      : 'https://api.openai.com/v1';
}

function subscriptionStreamOptions(
  record: SubscriptionCredential,
  options: SimpleStreamOptions | undefined,
  fetcher: typeof fetch,
): SimpleStreamOptions {
  const fields = { ...options, fetch: fetcher, maxRetries: 0 };
  if (record.kind === 'chatgpt-subscription')
    return {
      ...fields,
      headers: { ...options?.headers, ...attributionHeaders(APP_IDENTITY) },
      transport: 'sse',
      onPayload: subscriptionResponsesPayload,
      onProviderStreamEvent: subscriptionResponsesEvent,
    };
  if (record.kind === 'codex-subscription')
    return {
      ...fields,
      headers: { ...options?.headers, 'ChatGPT-Account-Id': record.accountId },
      transport: 'sse',
    };
  return fields;
}
