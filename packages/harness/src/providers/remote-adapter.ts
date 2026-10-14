import { LlmAdapter, LlmError, resolveRetryPolicy } from '@deepseek-ai/dsh-llm';
import type {
  GenerateOptions,
  LlmModelInfo,
  LlmProviderInfo,
  LlmResolvedModelInfo,
  PreparedAdapterCall,
  ResolvedRetryPolicy,
  StreamChunk,
} from '@deepseek-ai/dsh-llm';
import { SUBSCRIPTION_INFERENCE_REQUEST } from '@smarteverything/domain';
import type {
  AiModelRoute,
  DshWriterClaim,
  SubscriptionInferenceRequest,
  SubscriptionInferenceResult,
} from '@smarteverything/domain';
import { inferenceChunk, inferenceModel, inferenceFailure } from './inference-codec';
import { inferenceImages } from './inference-images';
import type { SubscriptionAttachmentOptions } from './pi-delegate';
import { SubscriptionProviderError } from './errors';

export interface SubscriptionInferencePort {
  call(
    request: SubscriptionInferenceRequest,
    signal: AbortSignal,
  ): AsyncIterable<SubscriptionInferenceResult>;
}
export class RemoteSubscriptionAdapter extends LlmAdapter {
  constructor(
    private readonly route: AiModelRoute,
    private readonly port: SubscriptionInferencePort,
    private readonly authorize: (options: GenerateOptions) => Promise<DshWriterClaim>,
    private readonly attachments: SubscriptionAttachmentOptions = {},
  ) {
    super();
  }
  override providerInfo(provider: string): LlmProviderInfo {
    this.assertRoute(provider);
    return {
      id: provider,
      name:
        this.route.auth.provider === 'anthropic' ? 'Claude subscription' : 'ChatGPT subscription',
    };
  }
  override providerRetryPolicy(provider: string): ResolvedRetryPolicy {
    this.assertRoute(provider);
    return resolveRetryPolicy(undefined, provider);
  }
  override listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    this.assertRoute(provider);
    return Promise.resolve(
      this.route.models.map((model) => ({
        provider,
        id: model.id,
        name: model.name,
        inputModalities: model.capabilities.input_modalities.filter(
          (modality) => modality !== 'file',
        ),
      })),
    );
  }
  override async resolveModel(
    provider: string,
    model: string,
    signal: AbortSignal = new AbortController().signal,
  ): Promise<LlmResolvedModelInfo> {
    this.assertRoute(provider);
    for await (const result of this.port.call(
      { kind: 'resolve', route: this.route, model },
      signal,
    )) {
      if (
        result.kind === 'model' &&
        result.model.provider === provider &&
        result.model.id === model
      )
        return inferenceModel(result.model);
      if (result.kind === 'failure') throw supplierError(result.failure);
      throw new SubscriptionProviderError(
        'AUTH_INVALID',
        'Supplier resolved a different model or returned an unexpected stream.',
      );
    }
    throw new SubscriptionProviderError(
      'PROVIDER_UNAVAILABLE',
      'Supplier closed before resolving the exact model.',
    );
  }
  override async prepareCall(
    provider: string,
    model: string,
    signal: AbortSignal = new AbortController().signal,
  ): Promise<PreparedAdapterCall> {
    const resolved = await this.resolveModel(provider, model, signal);
    return { model: resolved, stream: (options) => this.stream(options) };
  }
  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.assertRoute(options.provider);
    const signal = options.signal ?? new AbortController().signal;
    const claim = await this.authorize(options);
    const images = await inferenceImages(options, this.attachments);
    const { signal: _signal, ...wireOptions } = options;
    const request = SUBSCRIPTION_INFERENCE_REQUEST.parse({
      kind: 'stream',
      route: this.route,
      claim,
      options: wireOptions,
      images,
    });
    for await (const result of this.port.call(request, signal)) {
      if (result.kind === 'failure') throw supplierError(result.failure);
      if (result.kind !== 'chunk')
        throw new SubscriptionProviderError(
          'AUTH_INVALID',
          'Supplier returned model metadata during inference.',
        );
      const chunk = inferenceChunk(result.chunk);
      yield chunk;
      if (chunk.type === 'finish') return;
    }
    throw new SubscriptionProviderError(
      'PROVIDER_UNAVAILABLE',
      'Supplier stream ended without a terminal outcome; completion is uncertain.',
    );
  }
  private assertRoute(provider: string): void {
    if (this.route.id !== provider || this.route.billing !== 'subscription-only')
      throw new SubscriptionProviderError(
        'AUTH_DENIED',
        'Model call differs from the selected subscription route.',
      );
  }
}

function supplierError(value: unknown): LlmError {
  const failure = inferenceFailure(value);
  return new LlmError(failure.message, failure.code, failure);
}
