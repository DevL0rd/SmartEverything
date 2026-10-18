import type { IncomingMessage, ServerResponse } from 'node:http';
import { pipeline } from 'node:stream/promises';
import { guestResponseHeaders, type GuestRelayTarget } from './guest-contract';
import type { HubFetchLease } from './stream-fetch';
import { hubCall } from './transport';

export async function relayGuestRequest(
  request: IncomingMessage,
  response: ServerResponse,
  target: GuestRelayTarget,
  lease: HubFetchLease,
): Promise<void> {
  const failed = (): void => {
    if (!lease.signal.aborted) lease.failed?.();
  };
  if (target.method !== 'POST') request.resume();
  try {
    const upstream = await hubCall(lease, {
      method: target.method,
      headers: target.headers,
      ...(target.method === 'POST' ? { body: request } : {}),
    });
    upstream.body.once('error', failed);
    response.writeHead(upstream.statusCode, guestResponseHeaders(upstream.headers));
    response.flushHeaders();
    await pipeline(upstream.body, response, { signal: lease.signal });
  } catch (cause) {
    failed();
    throw cause;
  }
}
