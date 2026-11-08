import {
  ApiError,
  SPEECH_MODEL_PROVIDERS,
  SPEECH_SAMPLE_RATE,
  type CallEnding,
  type SpeechModel,
  type SpeechProvider as SpeechProviderName,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { opusCodec, OpusFramer } from '../assistant-voice/audio';
import type { PriceBook } from '../ledger/gemini-live';
import type { SpeakingAnchor } from '../reach/room-media';
import { recordSpeech } from '../ledger/speech';
import type { Store } from '../store/store';
import { withVolume } from './pcm-volume';
import { pcmWav } from './pcm-wav';
import type { SpeechChunk, SpeechProvider, SpeechUsage } from './speech-provider';
import { messageOf } from '@smarteverything/logging';

export interface SpeechSink {
  readonly audio: (packet: Uint8Array) => void;
  readonly said: () => void;
  readonly ended: (reason: CallEnding, detail: string | null) => void;
}

interface SpeechLine {
  readonly id: string;
  readonly profileId: string;
  readonly clientId: string | null;
  readonly text: string;
}

export interface SpeechRequest extends SpeechLine {
  readonly voice?: string;
  readonly volume?: number;
  readonly at?: SpeakingAnchor;
  readonly sink: SpeechSink;
}

export interface SpeechRecording extends SpeechLine {
  readonly chatId: string;
}

interface SpeechClip {
  readonly wav: Buffer;
  readonly model: SpeechModel;
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

const MAX_CLIP_SAMPLES = 180 * SPEECH_SAMPLE_RATE;

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
    this.options.log.debug('speech.requested', {
      id: request.id,
      profileId: request.profileId,
      clientId: request.clientId,
      textChars: request.text.length,
    });
    const finished = this.run(request, control.signal);
    finished.catch((cause: unknown) => {
      if (!control.signal.aborted) {
        const detail = messageOf(cause);
        this.options.log.warn('speech.failed', {
          id: request.id,
          detail: detail.slice(0, 300),
          cause: cause instanceof Error ? cause.name : typeof cause,
        });
        request.sink.ended('failed', detail);
      } else {
        this.options.log.debug('speech.aborted', { id: request.id });
      }
    });
    return Promise.resolve({
      end: async (reason): Promise<void> => {
        this.options.log.debug('speech.end_requested', { id: request.id, reason });
        if (reason !== 'finished') {
          control.abort();
        }
        // eslint-disable-next-line local/no-swallowed-errors -- the failure is logged where the speech starts
        await finished.catch(() => undefined);
      },
    });
  }

  async recordClip(request: SpeechRecording, signal: AbortSignal): Promise<SpeechClip> {
    const { model, chunks } = this.synthesis(request, signal);
    const buffers: Buffer[] = [];
    let samples = 0;
    const played = await this.play(chunks, (pcm) => {
      signal.throwIfAborted();
      samples += pcm.length;
      if (samples > MAX_CLIP_SAMPLES)
        throw new ApiError('invalid_request', 'A voice reply can be at most three minutes long.');
      buffers.push(Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength));
    });
    this.record(request, model, played, request.chatId);
    signal.throwIfAborted();
    if (samples === 0) throw new ApiError('conflict', 'The speech provider returned no audio.');
    return { wav: pcmWav(Buffer.concat(buffers), SPEECH_SAMPLE_RATE), model };
  }

  private synthesis(
    request: SpeechLine,
    signal: AbortSignal,
    override?: string,
  ): { readonly model: SpeechModel; readonly chunks: AsyncIterable<SpeechChunk> } {
    const { voice } = this.options.store.assistantChat.settings();
    const model = voice.speech_model;
    const provider = this.options.providers[SPEECH_MODEL_PROVIDERS[model]];
    return {
      model,
      chunks: provider.synthesize({
        model,
        voice: override ?? voice.speech_voice ?? voice.voice,
        text: request.text,
        signal,
      }),
    };
  }

  private async run(request: SpeechRequest, signal: AbortSignal): Promise<void> {
    const { model, chunks } = this.synthesis(request, signal, request.voice);
    const codec = opusCodec();
    const framer = new OpusFramer(codec);
    const startedAt = performance.now();
    this.options.log.info('speech.started', {
      id: request.id,
      model,
      provider: SPEECH_MODEL_PROVIDERS[model],
      textChars: request.text.length,
    });
    const emit = (frames: readonly Uint8Array[]): void => {
      frames.forEach((frame) => {
        request.sink.audio(frame);
      });
    };
    try {
      const played = await this.play(chunks, (pcm) => {
        emit(framer.live(withVolume(pcm, request.volume)));
      });
      emit(framer.flush());
      if (signal.aborted) {
        return;
      }
      this.record(request, model, played);
      this.options.log.info('speech.said', {
        id: request.id,
        model,
        audioMs: Math.round((played.samples * 1000) / SPEECH_SAMPLE_RATE),
        inputTokens: played.usage?.inputTokens,
        audioTokens: played.usage?.audioTokens,
        durationMs: Math.round(performance.now() - startedAt),
      });
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

  private record(request: SpeechLine, model: string, played: Played, chatId?: string): void {
    try {
      const { usage } = played;
      if (usage === null) {
        throw new SpeechUsageMissingError();
      }
      recordSpeech(this.options.store.ledger, this.options.prices, {
        profileId: request.profileId,
        clientId: request.clientId,
        callId: request.id,
        ...(chatId === undefined ? {} : { chatId }),
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
