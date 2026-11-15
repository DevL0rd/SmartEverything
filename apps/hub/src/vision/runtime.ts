import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import * as ort from 'onnxruntime-web/wasm';

const ORT_WASM = 'onnxruntime-web/ort-wasm-simd-threaded.wasm';

export type OnnxRuntime = typeof ort;

let configured = false;

export function onnxRuntime(threads: number): OnnxRuntime {
  if (!configured) {
    const require = createRequire(import.meta.url);
    ort.env.logLevel = 'error';
    ort.env.wasm.numThreads = threads;
    ort.env.wasm.wasmPaths = `${dirname(require.resolve(ORT_WASM))}/`;
    configured = true;
  }
  return ort;
}
