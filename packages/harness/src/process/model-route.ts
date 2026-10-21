import { LlmAdapter, LlmError, ReasoningEffortId } from '@deepseek-ai/dsh-llm';
import type {
  GenerateOptions,
  LlmModelInfo,
  LlmProviderInfo,
  LlmResolvedModelInfo,
  ResolvedRetryPolicy,
  StreamChunk,
  PreparedAdapterCall,
} from '@deepseek-ai/dsh-llm';
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai';
import type { ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai';
import { openrouterProvider } from '@earendil-works/pi-ai/providers/openrouter';
import type { Provider, Model, ModelThinkingLevel } from '@earendil-works/pi-ai';
import type { AiModelRoute } from '@smarteverything/domain';
import type { SubscriptionAttachmentOptions } from '../providers/pi-delegate';
import {
  TRANSIENT_RETRY_POLICY,
  retryAfterMs,
  withTransientFailures,
} from '../providers/transient-retry';

export interface MeteredRouteTransport {
  readonly key: () => Promise<string>;
  readonly fetch: (options: GenerateOptions) => typeof fetch;
  readonly authorize: (options: GenerateOptions) => Promise<void>;
}
export class MeteredRouteAdapter extends LlmAdapter {
  constructor(
    private readonly route: AiModelRoute,
    private readonly transport: MeteredRouteTransport,
    private readonly attachments: SubscriptionAttachmentOptions,
  ) {
    super();
  }
  override providerInfo(provider: string): LlmProviderInfo {
    this.check(provider);
    return { id: provider, name: 'OpenRouter' };
  }
  override providerRetryPolicy(provider: string): ResolvedRetryPolicy {
    this.check(provider);
    return TRANSIENT_RETRY_POLICY;
  }
  override listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    this.check(provider);
    return this.delegate().listModels(provider);
  }
  override async resolveModel(
    provider: string,
    model: string,
    signal?: AbortSignal,
  ): Promise<LlmResolvedModelInfo> {
    this.check(provider);
    return hubEfforts(await this.delegate().resolveModel(provider, model, signal));
  }
  override async prepareCall(
    provider: string,
    model: string,
    signal?: AbortSignal,
  ): Promise<PreparedAdapterCall> {
    return {
      model: await this.resolveModel(provider, model, signal),
      stream: (options) => this.stream(options),
    };
  }
  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.check(options.provider);
    await this.transport.authorize(options);
    const fetcher = this.transport.fetch(options);
    let retryAfter: number | undefined;
    const meteredFetch: typeof fetch = async (input, init): Promise<Response> => {
      const response = await fetcher(input, init);
      retryAfter = retryAfterMs(response.headers.get('retry-after'));
      return response;
    };
    yield* withTransientFailures(
      this.delegate(meteredFetch).stream(harnessEffort(options)),
      () => retryAfter,
    );
  }
  private check(provider: string): void {
    if (
      provider !== this.route.id ||
      this.route.auth.provider !== 'openrouter' ||
      this.route.billing !== 'metered' ||
      this.route.state !== 'ready'
    )
      throw new LlmError('Explicit metered route is unavailable.', 'ROUTE_UNAVAILABLE');
  }
  private delegate(fetcher: typeof fetch = fetch): PiAiAdapter {
    const provider = this.provider(fetcher, routeModels(this.route));
    const profile: ResolvedPiAiProviderProfile = {
      provider: this.route.id,
      displayName: 'OpenRouter',
      piProvider: provider,
      streamIdleTimeoutMs: 300_000,
      maxRequestImageBytes: 20 * 1024 * 1024,
      requestImagePixelBudget: 2048 * 2048,
      requestImageMaxBytes: 1024 * 1024,
      retryPolicy: TRANSIENT_RETRY_POLICY,
      modelErrors: new Map(),
      configuredMaxTokens: new Map(),
    };
    return new PiAiAdapter({
      profiles: () => new Map([[this.route.id, profile]]),
      resolveApiKey: () => this.transport.key(),
      auth: {
        credentials: {
          read: () => Promise.resolve(undefined),
          list: () => Promise.resolve([]),
          modify: (): Promise<never> =>
            Promise.reject(new LlmError('Metered routes cannot mutate credentials.', 'AUTH')),
          delete: () => Promise.resolve(),
        },
        authContext: {
          env: () => Promise.resolve(undefined),
          fileExists: () => Promise.resolve(false),
        },
      },
      ...this.attachments,
    });
  }
  private provider(
    fetcher: typeof fetch,
    models: readonly Model<'openai-completions'>[],
  ): Provider<'openai-completions'> {
    const native = openrouterProvider();
    const provider: Provider<'openai-completions'> = {
      id: this.route.id,
      name: 'OpenRouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      auth: {
        apiKey: {
          name: 'Explicit hub supplier',
          resolve: () => Promise.resolve({ auth: {}, source: 'explicit-harness-route' }),
        },
      },
      getModels: () => models,
      stream: (): never => {
        throw new LlmError('Use the native simple stream adapter.', 'ROUTE_UNAVAILABLE');
      },
      streamSimple: (model, context, options) =>
        native.streamSimple(model, context, {
          ...options,
          fetch: fetcher,
          maxRetries: 0,
        }),
    };
    return provider;
  }
}
const HUB_NO_EFFORT = 'none';
const HARNESS_NO_EFFORT = 'off';
function hubEffortId(id: ReasoningEffortId): ReasoningEffortId {
  return id === HARNESS_NO_EFFORT ? ReasoningEffortId(HUB_NO_EFFORT) : id;
}
function hubEfforts(info: LlmResolvedModelInfo): LlmResolvedModelInfo {
  const { reasoning } = info;
  if (reasoning === undefined) return info;
  return {
    ...info,
    reasoning: {
      ...reasoning,
      efforts: reasoning.efforts.map((effort) => ({ ...effort, id: hubEffortId(effort.id) })),
      ...(reasoning.defaultEffort === undefined
        ? {}
        : { defaultEffort: hubEffortId(reasoning.defaultEffort) }),
    },
  };
}
function harnessEffort(options: GenerateOptions): GenerateOptions {
  if (options.reasoningEffort !== HUB_NO_EFFORT) return options;
  return { ...options, reasoningEffort: ReasoningEffortId(HARNESS_NO_EFFORT) };
}
const UNKNOWN_CONTEXT_TOKENS = 128_000;
const THINKING_LEVELS: readonly ModelThinkingLevel[] = [
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
];
type ThinkingLevels = Partial<Record<ModelThinkingLevel, string | null>>;
function thinkingLevels(efforts: readonly string[]): ThinkingLevels {
  const offered = new Set(
    efforts.map((effort) => (effort === HUB_NO_EFFORT ? HARNESS_NO_EFFORT : effort)),
  );
  const levels: ThinkingLevels = {};
  for (const level of THINKING_LEVELS) {
    if (!offered.has(level)) levels[level] = null;
    else if (level !== 'off') levels[level] = level;
  }
  return levels;
}
function routeModels(route: AiModelRoute): readonly Model<'openai-completions'>[] {
  const catalogue = openrouterProvider().getModels();
  return route.models.map((model): Model<'openai-completions'> => {
    const known = catalogue.find((entry) => entry.id === model.id);
    const capabilities = model.capabilities;
    return {
      id: model.id,
      name: model.name,
      api: 'openai-completions',
      provider: route.id,
      baseUrl: 'https://openrouter.ai/api/v1',
      input: capabilities.input_modalities.includes('image') ? ['text', 'image'] : ['text'],
      reasoning: capabilities.reasoning,
      ...(capabilities.reasoning && capabilities.efforts.length > 0
        ? { thinkingLevelMap: thinkingLevels(capabilities.efforts) }
        : {}),
      contextWindow: capabilities.context_tokens ?? known?.contextWindow ?? UNKNOWN_CONTEXT_TOKENS,
      maxTokens: capabilities.max_output_tokens ?? known?.maxTokens ?? 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    };
  });
}
