import type { DesktopServer } from '@smarteverything/domain';
import type { HubLease } from '@smarteverything/hub/client-network/lease';
import { HubTransportError } from '@smarteverything/hub/client-network/policy';
import { headerEntries, hubCall } from '@smarteverything/hub/client-network/transport';
import { Readable } from 'node:stream';

export function desktopUpdateFetch(
  serverOf: () => Promise<DesktopServer | null>,
  route: (server: DesktopServer, input: string) => HubLease,
): typeof fetch {
  return async (input, init) => {
    const server = await serverOf();
    const request = new Request(input, init);
    if (
      server === null ||
      new URL(request.url).origin !== new URL(server.url).origin ||
      request.method !== 'GET'
    ) {
      throw new HubTransportError('Desktop updates require a GET from the enrolled Hub origin.');
    }
    const lease = route(server, request.url);
    const signal =
      lease.signal === undefined ? request.signal : AbortSignal.any([lease.signal, request.signal]);
    const response = await hubCall(
      { ...lease, signal },
      { method: 'GET', headers: Object.fromEntries(request.headers.entries()) },
    );
    return new Response(Readable.toWeb(response.body), {
      status: response.statusCode,
      headers: Object.fromEntries(headerEntries(response.headers)),
    });
  };
}
