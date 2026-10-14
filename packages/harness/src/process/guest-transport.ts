import { NATIVE_HUB_GUEST_PATH } from '@smarteverything/domain';
import type { HarnessBoot } from './boot';
import { HarnessRuntimeError } from '../host/errors';

export function guestHubFetch(boot: HarnessBoot, fetcher: typeof fetch = fetch): typeof fetch {
  const transport = boot.hub_transport;
  if (transport === undefined) return fetcher;
  return async (input, init): Promise<Response> => {
    const request = new Request(input, init);
    const target = new URL(request.url);
    if (target.origin !== transport.binding.canonicalOrigin) return fetcher(request);
    if (
      request.method !== 'POST' ||
      !NATIVE_HUB_GUEST_PATH.safeParse(target.pathname).success ||
      target.search !== '' ||
      target.hash !== '' ||
      request.headers.get('authorization') !== `Bearer ${boot.token}` ||
      Date.parse(transport.expiresAt) <= Date.now()
    )
      throw new HarnessRuntimeError(
        'ownership_lost',
        'Guest transport refused an expired or mismatched hub runtime request.',
      );
    const headers = new Headers(request.headers);
    const forwarded = new Request(`${transport.localUrl}${target.pathname}`, {
      method: request.method,
      headers,
      body: request.body,
      signal: request.signal,
      redirect: 'error',
      ...{ duplex: 'half' },
    });
    return fetcher(forwarded);
  };
}
