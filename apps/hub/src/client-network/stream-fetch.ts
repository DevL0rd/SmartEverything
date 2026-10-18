import { Readable } from 'node:stream';
import type { HubLease } from './lease';
import { headerEntries, hubCall } from './transport';

export interface HubFetchLease extends Omit<HubLease, 'signal'> {
  readonly signal: AbortSignal;
  readonly failed?: () => void;
}
export async function streamHubFetch(request: Request, lease: HubFetchLease): Promise<Response> {
  lease.signal.throwIfAborted();
  const failed = (): void => {
    if (!lease.signal.aborted) lease.failed?.();
  };
  try {
    const upstream = await hubCall(lease, {
      method: request.method,
      headers: Object.fromEntries(request.headers),
      ...(request.body === null ? {} : { body: Readable.fromWeb(request.body) }),
    });
    const status = upstream.statusCode;
    const headers = new Headers(headerEntries(upstream.headers));
    if (request.method === 'HEAD' || status === 204 || status === 205 || status === 304) {
      upstream.body.resume();
      return new Response(null, { status, headers });
    }
    upstream.body.once('error', failed);
    return new Response(Readable.toWeb(upstream.body), { status, headers });
  } catch (cause) {
    failed();
    throw cause;
  }
}
