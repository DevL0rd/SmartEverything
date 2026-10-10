import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import type { Model } from '@ricky0123/vad-web/dist/models/common.js';
import { Silero } from '@ricky0123/vad-web/dist/models/silero.js';
import * as ort from 'onnxruntime-web/wasm';

export const SILERO_MODEL = '@ricky0123/vad-web/dist/silero_vad_v6.onnx';
export const ORT_WASM = 'onnxruntime-web/ort-wasm-simd-threaded.wasm';

function modelBytes(path: string): Promise<ArrayBuffer> {
  return Promise.resolve(new Uint8Array(readFileSync(path)).buffer);
}

export function sileroModel(): Promise<Model> {
  const require = createRequire(import.meta.url);
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = `${dirname(require.resolve(ORT_WASM))}/`;
  const path = require.resolve(SILERO_MODEL);
  return Silero.new(ort, () => modelBytes(path));
}
