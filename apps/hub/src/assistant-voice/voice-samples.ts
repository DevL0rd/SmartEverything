import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { UsageMetadata } from '@google/genai';
import {
  ApiError,
  VOICE_PREVIEW_TEXT,
  type CallVoice,
  type VoiceSample,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { recordLiveTurn, type PriceBook } from '../ledger/gemini-live';
import type { Store } from '../store/store';
import type { VoiceSampleProvider } from './gemini-preview';
import { isMissing } from '../fs-util';

const MISSING_GEMINI_KEY_SAMPLE =
  'Add a Gemini key in Assistant settings › Voice calls to play voice samples.';

interface Listener {
  readonly clientId: string;
  readonly profileId: string;
}

export interface VoiceSamplesOptions {
  readonly provider: VoiceSampleProvider;
  readonly store: Store;
  readonly prices: PriceBook;
  readonly log: Logger;
  readonly key: () => string | null;
  readonly directory: string;
}

export class VoiceSamples {
  private budget: (() => string | null) | null = null;

  constructor(private readonly options: VoiceSamplesOptions) {}

  attachBudget(reason: () => string | null): void {
    this.budget = reason;
  }

  async sample(listener: Listener, voice: CallVoice, signal?: AbortSignal): Promise<VoiceSample> {
    const model = this.options.store.assistantChat.settings().voice.model;
    const file = this.pathOf(model, voice);
    const cached = await readFile(file).catch((error: unknown) => {
      if (isMissing(error)) return null;
      throw error;
    });
    if (cached !== null) return { audio: cached.toString('base64') };
    this.assertAvailable();
    const wav = await this.options.provider.sample({
      model,
      voice,
      signal: signal ?? new AbortController().signal,
      usage: (usage): void => {
        this.record(listener, model, usage);
      },
    });
    await this.keep(file, wav);
    return { audio: wav.toString('base64') };
  }

  private pathOf(model: string, voice: CallVoice): string {
    const key = createHash('sha256').update(`${model}\n${VOICE_PREVIEW_TEXT}`).digest('hex');
    return join(this.options.directory, `${voice}-${key.slice(0, 16)}.wav`);
  }

  private async keep(file: string, wav: Buffer): Promise<void> {
    await mkdir(this.options.directory, { recursive: true });
    const partial = `${file}.${randomUUID()}.part`;
    await writeFile(partial, wav);
    await rename(partial, file);
  }

  private assertAvailable(): void {
    if (this.options.key() === null) throw new ApiError('forbidden', MISSING_GEMINI_KEY_SAMPLE);
    const refusal = this.budget?.();
    if (refusal !== undefined && refusal !== null) throw new ApiError('forbidden', refusal);
  }

  private record(listener: Listener, model: string, usage: UsageMetadata): void {
    const callId = randomUUID();
    try {
      recordLiveTurn(this.options.store.ledger, this.options.prices, {
        ...listener,
        callId,
        chatId: null,
        messageId: null,
        pluginId: null,
        model,
        usage,
      });
    } catch (error) {
      this.options.log.error('voice_sample.usage_unrecorded', error, { callId });
    }
  }
}
