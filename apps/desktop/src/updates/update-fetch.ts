import type { DesktopServer } from '@smarteverything/domain';
import type { HubLease } from '@smarteverything/hub/client-network/lease';
import { HubTransportError } from '@smarteverything/hub/client-network/policy';
import { headerEntries, hubCall } from '@smarteverything/hub/client-network/transport';
import { Readable } from 'node:stream';

async function bodyOf(request: Request): Promise<string | undefined> {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined;
  const text = await request.text();
  return text === '' ? undefined : text;
}

function enrolledFetch(
  serverOf: () => Promise<DesktopServer | null>,
  route: (server: DesktopServer, input: string) => HubLease,
  getOnly: boolean,
): typeof fetch {
  return async (input, init) => {
    const server = await serverOf();
    const request = new Request(input, init);
    if (
      server === null ||
      new URL(request.url).origin !== new URL(server.url).origin ||
      (getOnly && request.method !== 'GET')
    ) {
      throw new HubTransportError(
        getOnly
          ? 'Desktop updates require a GET from the enrolled Hub origin.'
          : 'Desktop Hub calls require the enrolled Hub origin.',
      );
    }
    const lease = route(server, request.url);
    const signal =
      lease.signal === undefined ? request.signal : AbortSignal.any([lease.signal, request.signal]);
    const body = await bodyOf(request);
    const response = await hubCall(
      { ...lease, signal },
      {
        method: request.method,
        headers: Object.fromEntries(request.headers.entries()),
        ...(body === undefined ? {} : { body }),
      },
    );
    return new Response(Readable.toWeb(response.body), {
      status: response.statusCode,
      headers: Object.fromEntries(headerEntries(response.headers)),
    });
  };
}

export function desktopUpdateFetch(
  serverOf: () => Promise<DesktopServer | null>,
  route: (server: DesktopServer, input: string) => HubLease,
): typeof fetch {
  return enrolledFetch(serverOf, route, true);
}

export function desktopHubFetch(
  serverOf: () => Promise<DesktopServer | null>,
  route: (server: DesktopServer, input: string) => HubLease,
): typeof fetch {
  return enrolledFetch(serverOf, route, false);
}
