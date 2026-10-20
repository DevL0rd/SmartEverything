export type EarRuntimeLost = (reason: string) => void;

const WASM_ABORT_PREFIX = 'Aborted(';

export function isWasmAbort(reason: string): boolean {
  return reason.startsWith(WASM_ABORT_PREFIX);
}

export class EarRuntimeAbortedError extends Error {
  override readonly name = 'EarRuntimeAbortedError';
}
