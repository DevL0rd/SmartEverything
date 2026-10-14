import { LlmAdapter } from '@deepseek-ai/dsh-llm';
import type {
  GenerateOptions,
  LlmModelInfo,
  LlmProviderInfo,
  LlmResolvedModelInfo,
  PreparedAdapterCall,
  ResolvedRetryPolicy,
  StreamChunk,
} from '@deepseek-ai/dsh-llm';

export class ProcessRouteAdapter extends LlmAdapter {
  constructor(private current: LlmAdapter) {
    super();
  }
  replace(adapter: LlmAdapter): void {
    this.current = adapter;
  }
  override providerInfo(provider: string): LlmProviderInfo {
    return this.current.providerInfo(provider);
  }
  override providerRetryPolicy(provider: string): ResolvedRetryPolicy | undefined {
    return this.current.providerRetryPolicy(provider);
  }
  override listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return this.current.listModels(provider);
  }
  override resolveModel(
    provider: string,
    model: string,
    signal?: AbortSignal,
  ): Promise<LlmResolvedModelInfo> {
    return this.current.resolveModel(provider, model, signal);
  }
  override prepareCall(
    provider: string,
    model: string,
    signal?: AbortSignal,
  ): Promise<PreparedAdapterCall> {
    return this.current.prepareCall(provider, model, signal);
  }
  override stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    return this.current.stream(options);
  }
}
