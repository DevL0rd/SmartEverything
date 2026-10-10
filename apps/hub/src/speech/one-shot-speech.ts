import {
  SPEECH_MODEL_PROVIDERS,
  SPEECH_SAMPLE_RATE,
  type CallEnding,
  type SpeechProvider as SpeechProviderName,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { opusCodec, OpusFramer } from '../assistant-voice/audio';
import type { PriceBook } from '../ledger/gemini-live';
import { recordSpeech } from '../ledger/speech';
import type { Store } from '../store/store';
import type { SpeechChunk, SpeechProvider, SpeechUsage } from './speech-provider';

export interface SpeechSink {
  readonly audio: (packet: Uint8Array) => void;
  readonly said: () => void;
  readonly ended: (reason: CallEnding, detail: string | null) => void;
}

export interface SpeechRequest {
  readonly id: string;
  readonly profileId: string;
  readonly clientId: string | null;
  readonly text: string;
  readonly sink: SpeechSink;
}

export interface Saying {
  readonly end: (reason: CallEnding) => Promise<void>;
}

export type SpeechProviders = Readonly<Record<SpeechProviderName, SpeechProvider>>;

export interface OneShotSpeechOptions {
  readonly store: Store;
  readonly providers: SpeechProviders;
  readonly prices: PriceBook;
  readonly log: Logger;
}

interface Played {
  readonly samples: number;
  readonly usage: SpeechUsage | null;
}

class SpeechUsageMissingError extends Error {
  override readonly name = 'SpeechUsageMissingError';

  constructor() {
    super('The speech provider did not report what this line used.');
  }
}

export class OneShotSpeech {
  constructor(private readonly options: OneShotSpeechOptions) {}

  say(request: SpeechRequest): Promise<Saying> {
    const control = new AbortController();
    const finished = this.run(request, control.signal);
    finished.catch((cause: unknown) => {
      if (!control.signal.aborted) {
        const detail = cause instanceof Error ? cause.message : String(cause);
        this.options.log.warn('speech.failed', { id: request.id, detail });
        request.sink.ended('failed', detail);
      }
    });
    return Promise.resolve({
      end: async (reason): Promise<void> => {
        if (reason !== 'finished') {
          control.abort();
        }
        await finished.catch(() => undefined);
      },
    });
  }

  private async run(request: SpeechRequest, signal: AbortSignal): Promise<void> {
    const { voice } = this.options.store.assistantChat.settings();
    const model = voice.speech_model;
    const provider = this.options.providers[SPEECH_MODEL_PROVIDERS[model]];
    const codec = opusCodec();
    const framer = new OpusFramer(codec);
    const emit = (frames: readonly Uint8Array[]): void => {
      frames.forEach((frame) => {
        request.sink.audio(frame);
      });
    };
    try {
      const played = await this.play(
        provider.synthesize({
          model,
          voice: voice.speech_voice ?? voice.voice,
          text: request.text,
          signal,
        }),
        (pcm) => {
          emit(framer.live(pcm));
        },
      );
      emit(framer.flush());
      if (signal.aborted) {
        return;
      }
      this.record(request, model, played);
      this.options.log.info('speech.said', { id: request.id, model });
      request.sink.said();
    } finally {
      codec.free();
    }
  }

  private async play(
    chunks: AsyncIterable<SpeechChunk>,
    audio: (pcm: Int16Array) => void,
  ): Promise<Played> {
    let samples = 0;
    let usage: SpeechUsage | null = null;
    for await (const chunk of chunks) {
      if (chunk.kind === 'audio') {
        samples += chunk.pcm.length;
        audio(chunk.pcm);
      } else {
        usage = chunk.usage;
      }
    }
    return { samples, usage };
  }

  private record(request: SpeechRequest, model: string, played: Played): void {
    try {
      const { usage } = played;
      if (usage === null) {
        throw new SpeechUsageMissingError();
      }
      recordSpeech(this.options.store.ledger, this.options.prices, {
        profileId: request.profileId,
        clientId: request.clientId,
        callId: request.id,
        model,
        characters: request.text.length,
        inputTokens: usage.inputTokens,
        audioTokens: usage.audioTokens,
        audioMs: Math.round((played.samples * 1000) / SPEECH_SAMPLE_RATE),
      });
    } catch (cause) {
      this.options.log.error('speech.usage_unrecorded', cause, { callId: request.id });
    }
  }
}
