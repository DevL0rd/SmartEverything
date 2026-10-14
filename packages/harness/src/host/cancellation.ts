import { HarnessRuntimeError } from './errors';
export function awaitInteraction<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted();
  const pending = work();
  if (signal === undefined) return pending;
  return new Promise<T>((resolve, reject) => {
    const abort = (): void => {
      signal.removeEventListener('abort', abort);
      reject(interactionFailure(signal.reason));
    };
    signal.addEventListener('abort', abort, { once: true });
    pending.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', abort);
        reject(interactionFailure(error));
      },
    );
    if (signal.aborted) abort();
  });
}

function interactionFailure(reason: unknown): Error {
  return reason instanceof Error
    ? reason
    : new HarnessRuntimeError('operation_failed', 'Interaction failed or was cancelled.', null, {
        cause: reason,
      });
}
