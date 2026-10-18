import { createRequire } from 'node:module';
import { z } from 'zod';

export interface KeywordStream {
  readonly acceptWaveform: (sampleRate: number, samples: Float32Array) => void;
  readonly inputFinished: () => void;
  readonly free: () => void;
}

export interface Kws {
  readonly createStream: () => KeywordStream;
  readonly isReady: (stream: KeywordStream) => boolean;
  readonly decode: (stream: KeywordStream) => void;
  readonly reset: (stream: KeywordStream) => void;
  readonly getResult: (stream: KeywordStream) => unknown;
  readonly free: () => void;
}

interface KwsConfig {
  readonly featConfig: { readonly samplingRate: number; readonly featureDim: number };
  readonly modelConfig: {
    readonly transducer: {
      readonly encoder: string;
      readonly decoder: string;
      readonly joiner: string;
    };
    readonly tokens: string;
    readonly numThreads: number;
    readonly debug: number;
  };
  readonly keywords: string;
  readonly keywordsThreshold: number;
  readonly keywordsScore: number;
  readonly numTrailingBlanks: number;
  readonly maxActivePaths: number;
}

interface Sherpa {
  readonly createKws: (config: KwsConfig) => Kws;
}

class SherpaUnavailableError extends Error {
  override readonly name = 'SherpaUnavailableError';
}

export const KEYWORD_RESULT = z.object({ keyword: z.string() });

function isSherpa(value: unknown): value is Sherpa {
  return (
    typeof value === 'object' &&
    value !== null &&
    'createKws' in value &&
    typeof value.createKws === 'function'
  );
}

let loaded: Sherpa | null = null;

export function sherpa(): Sherpa {
  if (loaded === null) {
    const module: unknown = createRequire(import.meta.url)('sherpa-onnx');
    if (!isSherpa(module)) {
      throw new SherpaUnavailableError('sherpa-onnx loaded without its keyword spotter');
    }
    loaded = module;
  }
  return loaded;
}
