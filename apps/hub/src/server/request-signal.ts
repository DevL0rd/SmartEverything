import { LIVE_SEQUENCE_HEADER } from '@smarteverything/domain';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { IncomingMessage, ServerResponse } from 'node:http';

interface RequestContext {
  readonly signal: AbortSignal;
  readonly response: ServerResponse;
}
const requests = new AsyncLocalStorage<RequestContext>();

export function requestSequence(seq: number): void {
  requests.getStore()?.response.setHeader(LIVE_SEQUENCE_HEADER, String(seq));
}

export function currentRequestSignal(): AbortSignal | undefined {
  return requests.getStore()?.signal;
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
    return await requests.run({ signal: controller.signal, response }, work);
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
