import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { HubGuestBroker } from '../../src/client-network/guest-broker';
import type { HubLeasePort } from '../../src/client-network/lease';
import { HubResourceBroker } from '../../src/client-network/resource-broker';
import { captureLogs } from '../support/logs';

const closers: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

interface Upstream {
  readonly origin: string;
  readonly seen: { headers: IncomingHttpHeaders; method: string; url: string; body: string }[];
}
async function upstream(
  answer: (url: string) => { status: number; headers?: Record<string, string>; body: string },
): Promise<Upstream> {
  const seen: Upstream['seen'] = [];
  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      seen.push({
        headers: request.headers,
        method: request.method ?? '',
        url: request.url ?? '',
        body: Buffer.concat(chunks).toString('utf8'),
      });
      const reply = answer(request.url ?? '');
      response.writeHead(reply.status, reply.headers);
      response.end(reply.body);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  closers.push(() => {
    server.closeAllConnections();
    server.close();
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  return { origin: `http://127.0.0.1:${String(address.port)}`, seen };
}

const TOKEN = `scg_${'A'.repeat(43)}`;

async function guest(
  origin: string,
  signal = new AbortController().signal,
): Promise<{
  readonly mcpUrl: string;
  readonly broker: HubGuestBroker;
  readonly failures: number[];
}> {
  const failures: number[] = [];
  const broker = new HubGuestBroker(
    {
      lease: (url): { url: URL; signal: AbortSignal; generation: number } => ({
        url: new URL(url),
        signal,
        generation: 3,
      }),
      failed: (generation): void => {
        failures.push(generation);
      },
    },
    origin,
  );
  await broker.start();
  closers.push(() => {
    broker.close();
  });
  return {
    mcpUrl: broker.openMcp('claude', new URL('/mcp', origin).href, TOKEN),
    broker,
    failures,
  };
}

describe('guest MCP broker', () => {
  it('forwards the admitted headers and ignores every other header', async () => {
    const hub = await upstream(() => ({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: '{"ok":true}',
    }));
    const { mcpUrl } = await guest(hub.origin);
    const answer = await fetch(mcpUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'content-type': 'application/json',
        traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
        'x-stainless-lang': 'js',
        'x-request-id': 'abc',
      },
      body: '{"jsonrpc":"2.0"}',
    });
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({ ok: true });
    expect(hub.seen[0]?.body).toBe('{"jsonrpc":"2.0"}');
    expect(hub.seen[0]?.headers['traceparent']).toBeUndefined();
    expect(hub.seen[0]?.headers['x-stainless-lang']).toBeUndefined();
    expect(hub.seen[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('refuses a wrong credential with a reason and logs it', async () => {
    const logs = captureLogs();
    const hub = await upstream(() => ({ status: 200, body: '{}' }));
    const { mcpUrl } = await guest(hub.origin);
    const answer = await fetch(mcpUrl, {
      method: 'POST',
      headers: { authorization: 'Bearer wrong' },
      body: '{}',
    });
    expect(answer.status).toBe(403);
    expect(await answer.json()).toEqual({
      error: 'Guest credential does not belong to the admitted principal',
    });
    expect(logs.events()).toContain('guest.refused');
    expect(hub.seen).toHaveLength(0);
  });

  it('answers 409 for a retired grant and 502 when the hub is unreachable', async () => {
    const withdrawn = new AbortController();
    const hub = await upstream(() => ({ status: 200, body: '{}' }));
    const retired = await guest(hub.origin, withdrawn.signal);
    withdrawn.abort(new Error('Hub trust withdrawn'));
    const gone = await fetch(retired.mcpUrl, {
      method: 'GET',
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(gone.status).toBe(409);

    const dead = await upstream(() => ({ status: 200, body: '{}' }));
    const unreachable = await guest(dead.origin.replace(/:\d+$/, ':1'));
    const failed = await fetch(unreachable.mcpUrl, {
      method: 'GET',
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(failed.status).toBe(502);
    expect(unreachable.failures).toEqual([3]);
  });
});

function signedUrl(
  origin: string,
  path: string,
  lifetimeMs: number,
): { url: string; expiresAt: string } {
  const expires = Math.floor((Date.now() + lifetimeMs) / 1000);
  return {
    url: `${origin}${path}?expires=${String(expires)}&signature=${'a'.repeat(64)}&size=full`,
    expiresAt: new Date(expires * 1000).toISOString(),
  };
}
const BINDING = {
  scopeId: 'scope-1',
  canonicalOrigin: 'http://127.0.0.1:1',
  hubId: 'b'.repeat(64),
  principalId: 'phone',
  credentialKind: 'client',
  credentialGeneration: 0,
} as const;

async function resources(
  origin: string,
): Promise<{ broker: HubResourceBroker; controller: AbortController }> {
  const controller = new AbortController();
  const policies: HubLeasePort = {
    lease: (_scope, input) => ({ url: new URL(input), signal: controller.signal }),
  };
  const broker = new HubResourceBroker(policies, origin);
  await broker.start();
  closers.push(() => {
    broker.close();
  });
  return { broker, controller };
}

describe('resource broker', () => {
  it('serves a signed link that lives longer than ten minutes to a browser without origin or referrer', async () => {
    const hub = await upstream(() => ({
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
      body: 'pixels',
    }));
    const { broker } = await resources('http://app.example');
    const link = signedUrl(hub.origin, '/media/anything/at/all', 3_600_000);
    const resource = broker.open(1, {
      scopeId: 'scope-1',
      binding: { ...BINDING, canonicalOrigin: hub.origin },
      url: link.url,
      expiresAt: link.expiresAt,
      purpose: 'image',
    });
    const answer = await fetch(resource.localUrl, {
      headers: {
        'sec-fetch-site': 'cross-site',
        'sec-fetch-mode': 'no-cors',
        'sec-fetch-dest': 'image',
      },
    });
    expect(answer.status).toBe(200);
    expect(await answer.text()).toBe('pixels');
  });

  it('keeps the same grant when a resource is opened again under another route generation', async () => {
    const hub = await upstream(() => ({ status: 200, body: 'x' }));
    const { broker } = await resources('http://app.example');
    const link = signedUrl(hub.origin, '/media/recordings/r1', 600_000);
    const input = {
      scopeId: 'scope-1',
      binding: { ...BINDING, canonicalOrigin: hub.origin },
      url: link.url,
      expiresAt: link.expiresAt,
      purpose: 'recording',
    } as const;
    const first = broker.open(1, { ...input, routeGeneration: 1 });
    const second = broker.open(1, { ...input, routeGeneration: 2 });
    expect(second.id).toBe(first.id);
  });

  it('answers 409 with a reason once the grant is released and 502 when the hub fails', async () => {
    const hub = await upstream(() => ({ status: 200, body: 'x' }));
    const { broker } = await resources('http://app.example');
    const link = signedUrl(hub.origin, '/media/recordings/r1', 600_000);
    const resource = broker.open(1, {
      scopeId: 'scope-1',
      binding: { ...BINDING, canonicalOrigin: hub.origin },
      url: link.url,
      expiresAt: link.expiresAt,
      purpose: 'recording',
    });
    broker.release(1, resource.id);
    const gone = await fetch(resource.localUrl);
    expect(gone.status).toBe(409);
    expect(await gone.json()).toEqual({ error: 'Resource grant is unknown or was released' });

    const dead = signedUrl('http://127.0.0.1:1', '/media/recordings/r2', 600_000);
    const down = broker.open(1, {
      scopeId: 'scope-1',
      binding: { ...BINDING, canonicalOrigin: 'http://127.0.0.1:1' },
      url: dead.url,
      expiresAt: dead.expiresAt,
      purpose: 'recording',
    });
    expect((await fetch(down.localUrl)).status).toBe(502);
  });
});
