import { once } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable, Transform } from 'node:stream';
import { HubTransportError } from './policy';
import { streamHubFetch, type HubFetchLease } from './stream-fetch';
import { guestResponseHeaders, type GuestRelayTarget } from './guest-contract';

export const GUEST_QUEUE_BYTES = 64 * 1024;
export const GUEST_IDLE_TIMEOUT_MS = 60_000;
export class GuestInputLimitError extends Error {
  override readonly name = 'GuestInputLimitError';
  constructor(
    readonly limit: number,
    readonly received: number,
  ) {
    super('Guest request exceeds its existing endpoint input limit');
  }
}
export async function relayGuestRequest(
  request: IncomingMessage,
  response: ServerResponse,
  target: GuestRelayTarget,
  lease: HubFetchLease,
): Promise<void> {
  validateBody(request, target);
  let inputRefused = false;
  const limiter = limitedBody(target.limit, (): void => {
    inputRefused = true;
  });
  const scopedLease: HubFetchLease = {
    ...lease,
    failed: (): void => {
      if (!inputRefused && !lease.signal.aborted) lease.failed?.();
    },
  };
  const body = target.method === 'POST' ? Readable.toWeb(request.pipe(limiter)) : undefined;
  const upstream = new Request(target.url, {
    method: target.method,
    headers: target.headers,
    signal: lease.signal,
    redirect: 'error',
    ...(body === undefined ? {} : { body, ...{ duplex: 'half' } }),
  });
  const cancel = (): void => {
    limiter.destroy();
  };
  lease.signal.addEventListener('abort', cancel, { once: true });
  try {
    if (target.method !== 'POST') request.resume();
    const incoming = await streamHubFetch(upstream, scopedLease);
    response.writeHead(incoming.status, guestResponseHeaders(incoming.headers));
    response.flushHeaders();
    await forwardBody(incoming, response, lease.signal);
    response.end();
  } finally {
    lease.signal.removeEventListener('abort', cancel);
    limiter.destroy();
  }
}
function limitedBody(limit: number, refused: () => void): Transform {
  let bytes = 0;
  return new Transform({
    highWaterMark: GUEST_QUEUE_BYTES,
    transform(chunk: Buffer, _encoding, callback): void {
      bytes += chunk.byteLength;
      if (bytes > limit) {
        refused();
        callback(new GuestInputLimitError(limit, bytes));
      } else callback(null, chunk);
    },
  });
}
async function forwardBody(
  incoming: Response,
  response: ServerResponse,
  signal: AbortSignal,
): Promise<void> {
  if (incoming.body === null) return;
  const reader = incoming.body.getReader();
  try {
    for (;;) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) return;
      if (!response.write(chunk.value)) await once(response, 'drain', { signal });
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}

function validateBody(request: IncomingMessage, target: GuestRelayTarget): void {
  const length = request.headers['content-length'];
  if (length !== undefined && Number(length) > target.limit)
    throw new GuestInputLimitError(target.limit, Number(length));
  if (
    target.method !== 'POST' &&
    (request.headers['transfer-encoding'] !== undefined || (length !== undefined && length !== '0'))
  )
    throw new HubTransportError('This guest method accepts no body');
}
