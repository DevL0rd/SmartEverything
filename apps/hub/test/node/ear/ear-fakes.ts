import type { Model } from '@ricky0123/vad-web/dist/models/common.js';
import type { ListeningConfig } from '@smarteverything/domain';
import { Opus } from '../../../src/assistant-voice/opus';
import { EarEngine } from '../../../src/node/ear/ear-engine';
import type { KeywordEngine } from '../../../src/node/ear/relayed-spotter';
import type { KeywordStream, Kws } from '../../../src/wake-name/sherpa';
import { KeywordListening } from '../../../src/wake-name/keyword-spotter';

export const FRAME_48K = 960;

interface StreamState {
  samples: number;
  ready: boolean;
  keyword: string;
}

class FakeKws implements Kws {
  private readonly streams = new Map<KeywordStream, StreamState>();

  constructor(
    private readonly keyword: string,
    private readonly firesAfter: number,
    private readonly released: () => void,
  ) {}

  createStream(): KeywordStream {
    const state: StreamState = { samples: 0, ready: false, keyword: '' };
    const stream: KeywordStream = {
      acceptWaveform: (_rate, samples): void => {
        state.samples += samples.length;
        state.ready = true;
      },
      inputFinished: (): void => undefined,
      free: (): void => {
        this.released();
      },
    };
    this.streams.set(stream, state);
    return stream;
  }

  isReady(stream: KeywordStream): boolean {
    return this.streams.get(stream)?.ready ?? false;
  }

  decode(stream: KeywordStream): void {
    const state = this.streams.get(stream);
    if (state !== undefined) {
      state.ready = false;
      state.keyword = state.samples >= this.firesAfter ? this.keyword : '';
    }
  }

  reset(stream: KeywordStream): void {
    const state = this.streams.get(stream);
    if (state !== undefined) {
      state.samples = 0;
      state.keyword = '';
    }
  }

  getResult(stream: KeywordStream): unknown {
    return { keyword: this.streams.get(stream)?.keyword ?? '' };
  }

  free(): void {
    this.streams.clear();
  }
}

export interface Listened {
  readonly keywords: string;
  readonly threshold: number;
  readonly label: string;
}

export class FakeKeywords implements KeywordEngine {
  readonly listens: Listened[] = [];
  readonly nears: Listened[] = [];
  openStreams = 0;
  wakeAfterSamples = Number.POSITIVE_INFINITY;
  nearAfterSamples = Number.POSITIVE_INFINITY;
  failEarConfig = false;

  earConfig(): { keywords: string[]; threshold: number; nearMissThreshold: number } {
    return {
      keywords: this.failEarConfig ? [] : ['h ey @hey_jarvis'],
      threshold: 0.15,
      nearMissThreshold: 0.06,
    };
  }

  listenKeywords(keywords: string, threshold: number, label: string): KeywordListening | null {
    if (keywords === '') {
      return null;
    }
    this.listens.push({ keywords, threshold, label });
    return this.listening({ after: this.wakeAfterSamples, keywords, label, streams: 2 });
  }

  nearKeywords(keywords: string, threshold: number, label: string): KeywordListening | null {
    if (keywords === '') {
      return null;
    }
    this.nears.push({ keywords, threshold, label });
    return this.listening({ after: this.nearAfterSamples, keywords, label, streams: 1 });
  }

  free(): void {
    return undefined;
  }

  private listening(options: {
    readonly after: number;
    readonly keywords: string;
    readonly label: string;
    readonly streams: number;
  }): KeywordListening {
    const { after, keywords, label, streams } = options;
    this.openStreams += streams;
    return new KeywordListening(
      new FakeKws('hey_jarvis', after, () => {
        this.openStreams -= 1;
      }),
      `${label}\n${keywords}`,
      () => undefined,
      streams,
    );
  }
}

export class SpeakingModel implements Model {
  speech = false;
  released = 0;

  process(): Promise<{ notSpeech: number; isSpeech: number }> {
    return Promise.resolve(
      this.speech ? { notSpeech: 0.05, isSpeech: 0.95 } : { notSpeech: 1, isSpeech: 0 },
    );
  }

  reset_state(): void {
    return undefined;
  }

  release(): Promise<void> {
    this.released += 1;
    return Promise.resolve();
  }
}

export interface EarRig {
  readonly keywords: FakeKeywords;
  readonly models: SpeakingModel[];
  readonly engine: EarEngine;
}

export function earRig(): EarRig {
  const keywords = new FakeKeywords();
  const models: SpeakingModel[] = [];
  const engine = new EarEngine({
    spotter: (): KeywordEngine => keywords,
    model: (): Promise<Model> => {
      const model = new SpeakingModel();
      models.push(model);
      return Promise.resolve(model);
    },
  });
  return { keywords, models, engine };
}

export function configOf(over: Partial<ListeningConfig> = {}): ListeningConfig {
  return {
    wake: true,
    transcribe: false,
    sensitivity: 'standard',
    keywords: ['h ey @hey_jarvis'],
    threshold: 0.15,
    nearMissThreshold: 0.06,
    pause_ms: 200,
    ...over,
  };
}

export function tone(ms: number, amplitude = 6000, channels = 1): Int16Array {
  const frames = ms * 48;
  const out = new Int16Array(frames * channels);
  for (let index = 0; index < frames; index++) {
    const sample = Math.round(amplitude * Math.sin((2 * Math.PI * 440 * index) / 48_000));
    for (let channel = 0; channel < channels; channel++) {
      out[index * channels + channel] = sample;
    }
  }
  return out;
}

export function packetsOf(pcm48: Int16Array, channels = 1): string[] {
  const codec = new Opus(48_000, channels);
  const step = FRAME_48K * channels;
  const packets: string[] = [];
  for (let offset = 0; offset + step <= pcm48.length; offset += step) {
    packets.push(codec.encode(pcm48.slice(offset, offset + step), FRAME_48K).toString('base64'));
  }
  codec.free();
  return packets;
}
