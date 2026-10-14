import {
  ApiError,
  VOICE_PREVIEW_VERSION,
  type VoicePreview,
  type VoicePreviewCancel,
  type VoicePreviewRequest,
} from '@smarteverything/domain';
import type { UsageMetadata } from '@google/genai';
import type { Logger } from '@smarteverything/logging';
import { recordLiveTurn, type PriceBook } from '../ledger/gemini-live';
import type { Store } from '../store/store';
import type { VoiceSampleProvider } from './gemini-preview';

const MAX_CACHED_SAMPLES = 30;
const MAX_CLIENT_GENERATIONS = 256;
const MAX_ACTIVE_SAMPLES = 4;
interface SampleScope {
  readonly clientId: string;
  readonly profileId: string;
  readonly request: VoicePreviewRequest;
  readonly model: string;
  readonly signal: AbortSignal;
  readonly credentialRevision: number;
}
interface PendingSample {
  readonly requestId: string;
  readonly control: AbortController;
}
export interface VoicePreviewsOptions {
  readonly provider: VoiceSampleProvider;
  readonly store: Store;
  readonly prices: PriceBook;
  readonly log: Logger;
  readonly key: () => string | null;
}
export class VoicePreviews {
  private readonly active = new Map<string, PendingSample>();
  private readonly generations = new Map<string, number>();
  private readonly cache = new Map<string, string>();
  private credential: string | null = null;
  private credentialRevision = 0;
  private budget: (() => string | null) | null = null;
  constructor(private readonly options: VoicePreviewsOptions) {}
  attachBudget(reason: () => string | null): void {
    this.budget = reason;
  }
  cancel(clientId: string, request: VoicePreviewCancel): void {
    this.advance(clientId, request.generation);
    if (this.active.get(clientId)?.requestId === request.requestId) this.stop(clientId);
  }
  stop(clientId: string): void {
    this.active.get(clientId)?.control.abort();
    this.active.delete(clientId);
  }
  stopAll(): void {
    for (const clientId of this.active.keys()) this.stop(clientId);
  }
  invalidateCredential(): void {
    this.credential = this.options.key();
    this.credentialRevision += 1;
    this.stopAll();
    this.cache.clear();
  }
  async sample(
    clientId: string,
    profileId: string,
    request: VoicePreviewRequest,
    signal?: AbortSignal,
  ): Promise<VoicePreview> {
    if (!this.advance(clientId, request.generation))
      throw new ApiError('conflict', 'This voice sample has already stopped or was replaced.');
    this.stop(clientId);
    if (this.credential !== this.options.key()) this.invalidateCredential();
    this.assertAvailable();
    const pending = { requestId: request.requestId, control: new AbortController() };
    this.active.set(clientId, pending);
    const abort = (): void => {
      pending.control.abort();
    };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted === true) abort();
    const model = this.options.store.assistantChat.settings().voice.model;
    const scope = {
      clientId,
      profileId,
      request,
      model,
      signal: pending.control.signal,
      credentialRevision: this.credentialRevision,
    };
    try {
      const audio = await this.audio(scope);
      this.assertCredential(scope);
      return {
        requestId: request.requestId,
        voice: request.voice,
        model,
        version: VOICE_PREVIEW_VERSION,
        mime: 'audio/wav',
        audio,
      };
    } finally {
      signal?.removeEventListener('abort', abort);
      pending.control.abort();
      if (this.active.get(clientId) === pending) this.active.delete(clientId);
    }
  }
  private assertAvailable(): void {
    const refusal = this.budget?.();
    if (refusal !== undefined && refusal !== null) throw new ApiError('forbidden', refusal);
    if (this.active.size >= MAX_ACTIVE_SAMPLES)
      throw new ApiError('conflict', 'Other voice samples are still loading. Try again shortly.');
  }
  private advance(clientId: string, generation: number): boolean {
    const previous = this.generations.get(clientId);
    if (previous !== undefined && generation <= previous) return false;
    this.generations.delete(clientId);
    this.generations.set(clientId, generation);
    if (this.generations.size > MAX_CLIENT_GENERATIONS) {
      const oldest = this.generations.keys().next().value;
      if (oldest !== undefined) this.generations.delete(oldest);
    }
    return true;
  }
  private async audio(scope: SampleScope): Promise<string> {
    const { request, model, signal } = scope;
    this.assertCredential(scope);
    const cacheKey = `${model}:${request.voice}:${String(VOICE_PREVIEW_VERSION)}`;
    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) return cached;
    signal.throwIfAborted();
    const audio = await this.options.provider.sample({
      model,
      voice: request.voice,
      signal,
      usage: (usage): void => {
        this.record(scope, usage);
      },
    });
    this.assertCredential(scope);
    const encoded = audio.toString('base64');
    if (this.cache.size >= MAX_CACHED_SAMPLES) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(cacheKey, encoded);
    return encoded;
  }
  private assertCredential(scope: SampleScope): void {
    if (this.credential !== this.options.key()) this.invalidateCredential();
    if (scope.credentialRevision !== this.credentialRevision)
      throw new ApiError('conflict', 'The Gemini key changed. Play the voice sample again.');
    if (scope.signal.aborted) throw new ApiError('conflict', 'This voice sample stopped.');
  }
  private record(scope: SampleScope, usage: UsageMetadata): void {
    const { clientId, profileId, request, model } = scope;
    const requestId = request.requestId;
    try {
      recordLiveTurn(this.options.store.ledger, this.options.prices, {
        clientId,
        profileId,
        callId: requestId,
        chatId: null,
        messageId: null,
        pluginId: null,
        model,
        usage,
      });
    } catch (error) {
      this.options.log.error('voice_preview.usage_unrecorded', error, { requestId });
    }
  }
}
