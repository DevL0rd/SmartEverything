import { AsyncLocalStorage } from 'node:async_hooks';
import type { IncomingMessage, ServerResponse } from 'node:http';

const requests = new AsyncLocalStorage<AbortSignal>();

export function currentRequestSignal(): AbortSignal | undefined {
  return requests.getStore();
}

export async function withRequestSignal<T>(
  request: IncomingMessage,
  response: ServerResponse,
  work: () => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const aborted = (): void => {
    controller.abort();
  };
  const closed = (): void => {
    if (!response.writableFinished) aborted();
  };
  request.once('aborted', aborted);
  response.once('close', closed);
  if ((request.destroyed && !request.complete) || response.destroyed) aborted();
  try {
    return await requests.run(controller.signal, work);
  } finally {
    request.off('aborted', aborted);
    response.off('close', closed);
  }
}

export function requestSignalHandler(
  handler: (request: IncomingMessage, response: ServerResponse) => Promise<void>,
): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  return (request, response) =>
    withRequestSignal(request, response, () => handler(request, response));
}
