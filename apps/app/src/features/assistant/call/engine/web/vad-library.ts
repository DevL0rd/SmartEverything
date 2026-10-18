export const VAD_ASSET_PATH = '/vad/';
const SCRIPTS = ['ort.wasm.min.js', 'bundle.min.js'] as const;

interface VadFrameProbabilities {
  readonly isSpeech: number;
}

export interface MicVadOptions {
  readonly model: 'v6';
  readonly baseAssetPath: string;
  readonly onnxWASMBasePath: string;
  readonly positiveSpeechThreshold: number;
  readonly negativeSpeechThreshold: number;
  readonly preSpeechPadMs: number;
  readonly redemptionMs: number;
  readonly minSpeechMs: number;
  readonly submitUserSpeechOnPause: boolean;
  readonly startOnLoad: boolean;
  readonly getStream: () => Promise<MediaStream>;
  readonly pauseStream: (stream: MediaStream) => Promise<void>;
  readonly resumeStream: (stream: MediaStream) => Promise<MediaStream>;
  readonly onFrameProcessed: (probabilities: VadFrameProbabilities, frame: Float32Array) => void;
  readonly onSpeechRealStart: () => void;
  readonly onSpeechEnd: () => void;
  readonly onVADMisfire: () => void;
}

export interface VadTuning {
  readonly positiveSpeechThreshold: number;
  readonly negativeSpeechThreshold: number;
  readonly redemptionMs: number;
  readonly minSpeechMs: number;
}

export interface MicVad {
  readonly destroy: () => Promise<void>;
  readonly setOptions: (tuning: VadTuning) => void;
}

interface VadLibrary {
  readonly MicVAD: { readonly new: (options: MicVadOptions) => Promise<MicVad> };
}

class VadLibraryError extends Error {
  override readonly name = 'VadLibraryError';
}

function isVadLibrary(value: unknown): value is VadLibrary {
  if (typeof value !== 'object' || value === null || !('MicVAD' in value)) {
    return false;
  }
  const micVad: unknown = value.MicVAD;
  return typeof micVad === 'function' && 'new' in micVad && typeof micVad.new === 'function';
}

function loadScript(file: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${VAD_ASSET_PATH}${file}`;
    script.async = false;
    script.addEventListener('load', () => {
      resolve();
    });
    script.addEventListener('error', () => {
      reject(new VadLibraryError(`Speech detection could not load ${file}`));
    });
    document.head.append(script);
  });
}

let loading: Promise<VadLibrary> | null = null;

async function load(): Promise<VadLibrary> {
  for (const file of SCRIPTS) {
    await loadScript(file);
  }
  const library: unknown = Reflect.get(globalThis, 'vad');
  if (!isVadLibrary(library)) {
    throw new VadLibraryError('Speech detection loaded without its MicVAD');
  }
  return library;
}

export function vadLibrary(): Promise<VadLibrary> {
  loading ??= load().catch((cause: unknown) => {
    loading = null;
    throw cause;
  });
  return loading;
}
