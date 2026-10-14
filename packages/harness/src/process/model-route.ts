import { LlmAdapter, resolveRetryPolicy, LlmError } from '@deepseek-ai/dsh-llm';
import type {
  GenerateOptions,
  LlmModelInfo,
  LlmProviderInfo,
  LlmResolvedModelInfo,
  StreamChunk,
  PreparedAdapterCall,
} from '@deepseek-ai/dsh-llm';
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai';
import type { ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai';
import { openrouterProvider } from '@earendil-works/pi-ai/providers/openrouter';
import type { Provider, Model } from '@earendil-works/pi-ai';
import type { AiModelRoute } from '@smarteverything/domain';
import type { SubscriptionAttachmentOptions } from '../providers/pi-delegate';
import { MeteredUsageStream } from './metered-usage';

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
  override providerRetryPolicy(provider: string): ReturnType<typeof resolveRetryPolicy> {
    this.check(provider);
    return resolveRetryPolicy(undefined, provider);
  }
  override listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    this.check(provider);
    return this.delegate().listModels(provider);
  }
  override resolveModel(
    provider: string,
    model: string,
    signal?: AbortSignal,
  ): Promise<LlmResolvedModelInfo> {
    this.check(provider);
    return this.delegate().resolveModel(provider, model, signal);
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
    const observed = new MeteredUsageStream((): void => undefined);
    const fetcher = this.transport.fetch(options);
    const meteredFetch: typeof fetch = async (input, init): Promise<Response> =>
      observed.response(await fetcher(input, init));
    for await (const chunk of this.delegate(meteredFetch).stream(options)) {
      await this.transport.authorize(options);
      if (chunk.type === 'usage' && observed.snapshot !== undefined) {
        const usage = { ...chunk.usage, supplier: observed.snapshot };
        yield { ...chunk, usage };
      } else yield chunk;
    }
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
    const catalog = routeModels(this.route);
    const provider = this.provider(fetcher, catalog.models);
    const profile: ResolvedPiAiProviderProfile = {
      provider: this.route.id,
      displayName: 'OpenRouter',
      piProvider: provider,
      streamIdleTimeoutMs: 300_000,
      maxRequestImageBytes: 20 * 1024 * 1024,
      requestImagePixelBudget: 2048 * 2048,
      requestImageMaxBytes: 1024 * 1024,
      retryPolicy: resolveRetryPolicy(undefined, this.route.id),
      modelErrors: catalog.modelErrors,
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
function routeModels(route: AiModelRoute): {
  readonly models: readonly Model<'openai-completions'>[];
  readonly modelErrors: ReadonlyMap<string, string>;
} {
  const models: Model<'openai-completions'>[] = [];
  const modelErrors = new Map<string, string>();
  for (const model of route.models) {
    try {
      models.push(routeModel(route.id, model));
    } catch (error) {
      if (!(error instanceof LlmError)) throw error;
      modelErrors.set(model.id, error.message);
    }
  }
  return { models, modelErrors };
}
function routeModel(
  provider: string,
  model: AiModelRoute['models'][number],
): Model<'openai-completions'> {
  const capabilities = model.capabilities;
  if (/^(?:anthropic|openai)\//.test(model.id))
    throw new LlmError(
      `Provider "${provider}" model "${model.id}" requires a subscription route.`,
      'AUTH',
    );
  if (
    capabilities.context_tokens === null ||
    capabilities.max_output_tokens === undefined ||
    capabilities.max_output_tokens === null
  )
    throw new LlmError(
      `Provider "${provider}" model "${model.id}" requires discovered context/output limits; received context=${String(capabilities.context_tokens)}, output=${String(capabilities.max_output_tokens)}.`,
      'MODEL_UNAVAILABLE',
    );
  return {
    id: model.id,
    name: model.name,
    api: 'openai-completions',
    provider,
    baseUrl: 'https://openrouter.ai/api/v1',
    input: capabilities.input_modalities.includes('image') ? ['text', 'image'] : ['text'],
    reasoning: capabilities.reasoning,
    contextWindow: capabilities.context_tokens,
    maxTokens: capabilities.max_output_tokens,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };
}
