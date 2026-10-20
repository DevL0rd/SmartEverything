import { fileURLToPath } from 'node:url';
import { KEYWORD_RESULT, sherpa, type KeywordStream, type Kws } from './sherpa';

const SAMPLE_RATE = 16_000;
const PCM_FULL_SCALE = 32_768;
const STAGGER_SAMPLES = 1280;
const STREAMS = { single: 1, staggered: 2 } as const;

const KEYWORD_TUNING = {
  boost: 2,
  activePaths: 8,
} as const;

const SCORE_LADDER = [0.4, 0.3, 0.25, 0.2, 0.15, 0.12, 0.1, 0.08, 0.06, 0.04, 0.02] as const;
const FRAME_SAMPLES = 320;
const FRAMES_PER_YIELD = 50;

const breathe = (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

function modelDirectory(): string {
  return fileURLToPath(new URL('wake-name-model/', import.meta.url));
}

class Keyset {
  readonly spotters = new Map<number, Kws>();
  users = 0;

  constructor(readonly keywords: string) {}

  free(): void {
    this.spotters.forEach((kws) => {
      kws.free();
    });
  }
}

export class KeywordSpotter {
  private current: Keyset | null = null;
  private readonly retired = new Set<Keyset>();

  constructor(private readonly directory: string = modelDirectory()) {}

  async scoreOf(keywords: string, pcm: Int16Array): Promise<number | null> {
    let low = 0;
    let high = SCORE_LADDER.length - 1;
    let best: number | null = null;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const threshold = SCORE_LADDER[middle] ?? 0;
      if (await this.hears(keywords, threshold, pcm)) {
        best = threshold;
        high = middle - 1;
      } else {
        low = middle + 1;
      }
    }
    return best;
  }

  async hears(keywords: string, threshold: number, pcm: Int16Array): Promise<boolean> {
    const listening = this.listenWith(keywords, threshold, String(threshold), STREAMS.staggered);
    if (listening === null) {
      return false;
    }
    try {
      for (let offset = 0; offset < pcm.length; offset += FRAME_SAMPLES) {
        if (listening.hear(pcm.subarray(offset, offset + FRAME_SAMPLES)) !== null) {
          return true;
        }
        if ((offset / FRAME_SAMPLES) % FRAMES_PER_YIELD === 0) {
          await breathe();
        }
      }
      return false;
    } finally {
      listening.free();
    }
  }

  listenKeywords(keywords: string, threshold: number, label: string): KeywordListening | null {
    return this.listenWith(keywords, threshold, label, STREAMS.staggered);
  }

  nearKeywords(keywords: string, threshold: number, label: string): KeywordListening | null {
    return this.listenWith(keywords, threshold, label, STREAMS.single);
  }

  private listenWith(
    keywords: string,
    threshold: number,
    label: string,
    streams: number,
  ): KeywordListening | null {
    if (keywords === '') {
      return null;
    }
    const keyset = this.keysetFor(keywords);
    const kws = this.spotterFor(keyset, threshold);
    keyset.users += 1;
    return new KeywordListening(
      kws,
      `${label}\n${keywords}`,
      () => {
        keyset.users -= 1;
        this.sweep();
      },
      streams,
    );
  }

  free(): void {
    if (this.current !== null) {
      this.retired.add(this.current);
      this.current = null;
    }
    this.sweep();
  }

  private keysetFor(keywords: string): Keyset {
    if (this.current?.keywords === keywords) {
      return this.current;
    }
    this.free();
    this.current = new Keyset(keywords);
    return this.current;
  }

  private spotterFor(keyset: Keyset, threshold: number): Kws {
    const known = keyset.spotters.get(threshold);
    if (known !== undefined) {
      return known;
    }
    const kws = this.create(keyset.keywords, threshold);
    keyset.spotters.set(threshold, kws);
    return kws;
  }

  private sweep(): void {
    for (const keyset of [...this.retired]) {
      if (keyset.users === 0) {
        keyset.free();
        this.retired.delete(keyset);
      }
    }
  }

  private create(keywords: string, threshold: number): Kws {
    const directory = this.directory;
    return sherpa().createKws({
      featConfig: { samplingRate: SAMPLE_RATE, featureDim: 80 },
      modelConfig: {
        transducer: {
          encoder: `${directory}encoder.int8.onnx`,
          decoder: `${directory}decoder.int8.onnx`,
          joiner: `${directory}joiner.int8.onnx`,
        },
        tokens: `${directory}tokens.txt`,
        numThreads: 1,
        debug: 0,
      },
      keywords,
      keywordsThreshold: threshold,
      keywordsScore: KEYWORD_TUNING.boost,
      numTrailingBlanks: 1,
      maxActivePaths: KEYWORD_TUNING.activePaths,
    });
  }
}

export class KeywordListening {
  private readonly streams: readonly KeywordStream[];
  private lagging = STAGGER_SAMPLES;
  private freed = false;

  constructor(
    private readonly kws: Kws,
    readonly key: string,
    private readonly done: () => void,
    streams: number = STREAMS.staggered,
  ) {
    this.streams = Array.from({ length: streams }, () => kws.createStream());
  }

  hear(pcm: Int16Array): string | null {
    const samples = Float32Array.from(pcm, (sample) => sample / PCM_FULL_SCALE);
    const skipped = Math.min(this.lagging, samples.length);
    this.lagging -= skipped;
    const [early, late] = this.streams;
    early?.acceptWaveform(SAMPLE_RATE, samples);
    late?.acceptWaveform(SAMPLE_RATE, samples.subarray(skipped));
    const heard = this.streams.map((stream) => this.decode(stream)).find((one) => one !== null);
    if (heard === undefined) {
      return null;
    }
    this.streams.forEach((stream) => {
      this.kws.reset(stream);
    });
    return heard;
  }

  free(): void {
    if (!this.freed) {
      this.freed = true;
      this.streams.forEach((stream) => {
        stream.free();
      });
      this.done();
    }
  }

  private decode(stream: KeywordStream): string | null {
    let heard: string | null = null;
    while (this.kws.isReady(stream)) {
      this.kws.decode(stream);
      const { keyword } = KEYWORD_RESULT.parse(this.kws.getResult(stream));
      if (keyword !== '') {
        this.kws.reset(stream);
        heard ??= keyword.replace(/_/g, ' ');
      }
    }
    return heard;
  }
}
