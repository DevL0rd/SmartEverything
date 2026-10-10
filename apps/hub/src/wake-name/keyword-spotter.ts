import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { KEYWORD_RESULT, sherpa, type KeywordStream, type Kws } from './sherpa';
import { pieceVocabulary, wordPieces, type PieceVocabulary } from './word-pieces';

const SAMPLE_RATE = 16_000;
const PCM_FULL_SCALE = 32_768;
const TRAILING_SILENCE = new Float32Array(SAMPLE_RATE / 2);

export const KEYWORD_TUNING = {
  threshold: 0.2,
  nearThreshold: 0.08,
  boost: 2,
  activePaths: 8,
} as const;

export function modelDirectory(): string {
  return fileURLToPath(new URL('wake-name-model/', import.meta.url));
}

export function wakePhrases(names: readonly string[]): string[] {
  return [...new Set(names.map((name) => name.trim()).filter((name) => name !== ''))];
}

function keywordLines(vocabulary: PieceVocabulary, phrases: readonly string[]): string {
  return phrases
    .map((phrase) => {
      const pieces = wordPieces(vocabulary, phrase);
      return pieces === null ? null : `${pieces.join(' ')} @${phrase.replace(/\s+/g, '_')}`;
    })
    .filter((line) => line !== null)
    .join('\n');
}

interface Loaded {
  readonly sure: Kws;
  readonly near: Kws;
  readonly keywords: string;
  users: number;
}

export interface SegmentResult {
  readonly heard: string | null;
  readonly nearMiss: string | null;
}

export class KeywordSpotter {
  private readonly vocabulary: PieceVocabulary;
  private current: Loaded | null = null;
  private readonly retired = new Set<Loaded>();

  constructor(private readonly directory: string = modelDirectory()) {
    this.vocabulary = pieceVocabulary(readFileSync(`${directory}bpe.vocab`, 'utf8'));
  }

  listen(names: readonly string[]): KeywordListening | null {
    const loaded = this.forKeywords(keywordLines(this.vocabulary, wakePhrases(names)));
    if (loaded === null) {
      return null;
    }
    loaded.users += 1;
    return new KeywordListening(loaded, () => {
      loaded.users -= 1;
      this.sweep();
    });
  }

  free(): void {
    if (this.current !== null) {
      this.retired.add(this.current);
      this.current = null;
    }
    this.sweep();
  }

  private forKeywords(keywords: string): Loaded | null {
    if (keywords === '') {
      return null;
    }
    if (this.current?.keywords !== keywords) {
      this.free();
      this.current = {
        sure: this.create(keywords, KEYWORD_TUNING.threshold),
        near: this.create(keywords, KEYWORD_TUNING.nearThreshold),
        keywords,
        users: 0,
      };
    }
    return this.current;
  }

  private sweep(): void {
    for (const loaded of [...this.retired]) {
      if (loaded.users === 0) {
        loaded.sure.free();
        loaded.near.free();
        this.retired.delete(loaded);
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

class SpottingStream {
  private readonly stream: KeywordStream;
  private found: string | null = null;

  constructor(private readonly kws: Kws) {
    this.stream = kws.createStream();
  }

  feed(samples: Float32Array): string | null {
    this.stream.acceptWaveform(SAMPLE_RATE, samples);
    while (this.kws.isReady(this.stream)) {
      this.kws.decode(this.stream);
      const { keyword } = KEYWORD_RESULT.parse(this.kws.getResult(this.stream));
      if (keyword !== '') {
        this.kws.reset(this.stream);
        this.found ??= keyword.replace(/_/g, ' ');
        return this.found;
      }
    }
    return null;
  }

  finish(): string | null {
    this.feed(TRAILING_SILENCE);
    this.stream.inputFinished();
    this.feed(new Float32Array(0));
    this.stream.free();
    return this.found;
  }
}

export class KeywordListening {
  private readonly sure: SpottingStream;
  private readonly near: SpottingStream;
  private reported = false;

  constructor(
    loaded: Loaded,
    private readonly done: () => void,
  ) {
    this.sure = new SpottingStream(loaded.sure);
    this.near = new SpottingStream(loaded.near);
  }

  hear(pcm: Int16Array): string | null {
    const samples = Float32Array.from(pcm, (sample) => sample / PCM_FULL_SCALE);
    this.near.feed(samples);
    return this.report(this.sure.feed(samples));
  }

  finish(): SegmentResult {
    const nearMiss = this.near.finish();
    const heard = this.report(this.sure.finish());
    this.done();
    return { heard, nearMiss: this.reported ? null : nearMiss };
  }

  private report(heard: string | null): string | null {
    if (heard === null || this.reported) {
      return null;
    }
    this.reported = true;
    return heard;
  }
}
