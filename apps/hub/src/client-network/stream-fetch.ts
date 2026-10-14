import {
  request as httpRequest,
  type IncomingMessage,
  type ClientRequest,
  type RequestOptions,
} from 'node:http';
import { request as httpsRequest, type Agent } from 'node:https';
import { once } from 'node:events';
import { HubTransportError } from './policy';

const RESPONSE_HEADERS_TIMEOUT_MS = 15_000;
const HUB_STREAM_QUEUE_BYTES = 64 * 1024;

export interface HubFetchLease {
  readonly url: URL;
  readonly agent: Agent | undefined;
  readonly signal: AbortSignal;
  readonly failed?: () => void;
}
export async function streamHubFetch(request: Request, lease: HubFetchLease): Promise<Response> {
  lease.signal.throwIfAborted();
  const headers = Object.fromEntries(request.headers);
  for (const name of Object.keys(headers))
    if (['host', 'connection', 'transfer-encoding', 'content-length'].includes(name))
      throw new HubTransportError('Hub request contains a reserved transport header');
  return new Promise((resolve, reject) => {
    const create = lease.url.protocol === 'https:' ? httpsRequest : httpRequest;
    const options: RequestOptions & { readonly hubAbortSignal: AbortSignal } = {
      method: request.method,
      headers,
      agent: lease.agent,
      signal: lease.signal,
      hubAbortSignal: lease.signal,
    };
    const outgoing = create(lease.url, options, (incoming) => {
      try {
        resolve(responseOf(incoming, request.method, lease.failed));
      } catch (cause) {
        incoming.destroy();
        reject(cause instanceof Error ? cause : new HubTransportError('Hub response failed'));
      }
    });
    outgoing.once('error', (cause) => {
      lease.failed?.();
      reject(cause);
    });
    const timer = setTimeout(() => {
      outgoing.destroy(new HubTransportError('Hub response headers timed out'));
    }, RESPONSE_HEADERS_TIMEOUT_MS);
    timer.unref();
    outgoing.once('response', () => {
      clearTimeout(timer);
    });
    outgoing.once('close', () => {
      clearTimeout(timer);
    });
    void writeBody(outgoing, request).catch((cause: unknown) => {
      outgoing.destroy(
        cause instanceof Error ? cause : new HubTransportError('Hub request body failed'),
      );
    });
  });
}
async function writeBody(outgoing: ClientRequest, request: Request): Promise<void> {
  const reader = request.body?.getReader();
  if (reader === undefined) {
    outgoing.end();
    return;
  }
  const cancel = (): void => {
    void reader.cancel().catch((cause: unknown) => {
      outgoing.destroy(
        cause instanceof Error ? cause : new HubTransportError('Hub request cancellation failed'),
      );
    });
  };
  outgoing.once('close', cancel);
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (!outgoing.write(chunk.value)) await once(outgoing, 'drain');
    }
    outgoing.end();
  } finally {
    outgoing.removeListener('close', cancel);
    await reader.cancel();
  }
}
function responseOf(
  incoming: IncomingMessage,
  method: string,
  failed: (() => void) | undefined,
): Response {
  const status = incoming.statusCode;
  if (status === undefined || (status >= 300 && status < 400))
    throw new HubTransportError('Hub redirects are forbidden');
  const headers = responseHeaders(incoming);
  if (method === 'HEAD' || status === 204 || status === 205 || status === 304) {
    incoming.resume();
    return new Response(null, { status, headers });
  }
  return new Response(responseBody(incoming, failed), { status, headers });
}
function responseBody(
  incoming: IncomingMessage,
  failed: (() => void) | undefined,
): ReadableStream<Uint8Array> {
  let finished = false;
  let cleanup: (() => void) | undefined;
  const finish = (): boolean => {
    if (finished) return false;
    finished = true;
    cleanup?.();
    return true;
  };
  incoming.pause();
  return new ReadableStream<Uint8Array>(
    {
      start(controller): void {
        cleanup = listenToResponseBody(
          incoming,
          controller,
          { finished: (): boolean => finished, finish },
          failed,
        );
      },
      pull(): void {
        if (!finished) incoming.resume();
      },
      cancel(): void {
        if (finish()) incoming.destroy();
      },
    },
    { highWaterMark: HUB_STREAM_QUEUE_BYTES, size: (chunk): number => chunk.byteLength },
  );
}
interface ResponseBodyLifecycle {
  readonly finished: () => boolean;
  readonly finish: () => boolean;
}
function listenToResponseBody(
  incoming: IncomingMessage,
  controller: ReadableStreamDefaultController<Uint8Array>,
  lifecycle: ResponseBodyLifecycle,
  failed: (() => void) | undefined,
): () => void {
  const data = (chunk: Buffer): void => {
    if (lifecycle.finished()) return;
    controller.enqueue(chunk);
    incoming.pause();
  };
  const end = (): void => {
    if (lifecycle.finish()) controller.close();
  };
  const error = (cause: Error): void => {
    if (!lifecycle.finish()) return;
    failed?.();
    controller.error(cause);
  };
  const aborted = (): void => {
    error(new HubTransportError('Hub response interrupted'));
  };
  incoming.on('data', data);
  incoming.once('end', end);
  incoming.on('error', error);
  incoming.once('aborted', aborted);
  incoming.once('close', () => {
    aborted();
    incoming.removeListener('error', error);
  });
  return (): void => {
    incoming.removeListener('data', data);
    incoming.removeListener('end', end);
    incoming.removeListener('aborted', aborted);
  };
}

function responseHeaders(incoming: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming.headers))
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  return headers;
}
