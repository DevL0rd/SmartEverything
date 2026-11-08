import {
  createServer,
  get as httpGet,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { HubGuestBroker } from '@smarteverything/hub/client-network/guest-broker';
import type { NodeRouteState } from '@smarteverything/hub/client-network/route-authority';
import {
  registerDriveFamilies,
  type DriveTransport,
} from '../../src/drive-mount/broker-families.js';
import {
  closePlacementDavGrant,
  openFileGrant,
  openHelperGrant,
  openPlacementDavGrant,
} from '../../src/drive-mount/broker-grants.js';

const closers: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const NODE_TOKEN = 'node-token-for-test-0123456789';
const CANONICAL = 'http://hub.test';
const FILE = Buffer.from(Array.from({ length: 4096 }, (_, index) => index % 251));

interface Seen {
  readonly method: string;
  readonly url: string;
  readonly headers: IncomingHttpHeaders;
}
interface Hub {
  readonly origin: string;
  readonly seen: Seen[];
}
interface HubOptions {
  readonly stallFirstReadAfter?: number;
  readonly dropWrites?: boolean;
}

interface Slice {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly data: Buffer;
}
function sliceOf(headers: IncomingHttpHeaders): Slice {
  const range = /^bytes=(\d+)-(\d*)$/.exec(headers.range ?? '');
  const condition = headers['if-range'];
  const partial = range !== null && (condition === undefined || condition === '"v1"');
  const start = partial ? Number(range[1]) : 0;
  const end = partial && range[2] !== '' ? Number(range[2]) : FILE.length - 1;
  const data = FILE.subarray(start, end + 1);
  return {
    status: partial ? 206 : 200,
    data,
    headers: {
      'content-type': 'application/octet-stream',
      'content-length': String(data.length),
      etag: '"v1"',
      'accept-ranges': 'bytes',
      'x-internal': 'hidden',
      ...(partial
        ? { 'content-range': `bytes ${String(start)}-${String(end)}/${String(FILE.length)}` }
        : {}),
    },
  };
}
function answerWrite(request: IncomingMessage, response: ServerResponse, drop: boolean): void {
  if (drop) {
    request.socket.destroy();
    return;
  }
  response.writeHead(200, { 'content-type': 'application/json', 'set-cookie': 'a=b' });
  response.end('{"ok":true}');
}
function answerRead(
  request: IncomingMessage,
  response: ServerResponse,
  stall: number | undefined,
): void {
  const slice = sliceOf(request.headers);
  response.writeHead(slice.status, slice.headers);
  if (request.method === 'HEAD') response.end();
  else if (stall === undefined) response.end(slice.data);
  else response.write(slice.data.subarray(0, stall));
}

async function hub(options: HubOptions = {}): Promise<Hub> {
  const seen: Seen[] = [];
  let reads = 0;
  const server: Server = createServer((request, response) => {
    seen.push({
      method: request.method ?? '',
      url: request.url ?? '',
      headers: request.headers,
    });
    request.resume();
    if (request.method === 'POST' || request.method === 'PATCH') {
      answerWrite(request, response, options.dropWrites === true);
      return;
    }
    answerRead(request, response, reads === 0 ? options.stallFirstReadAfter : undefined);
    reads += 1;
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

interface Streamed {
  readonly status: number;
  readonly data: Buffer;
  readonly complete: boolean;
}
function streamed(url: string, afterBytes: number, action: () => void): Promise<Streamed> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let received = 0;
    let acted = false;
    const req = httpGet(url, (response) => {
      const finish = (complete: boolean): void => {
        resolve({
          status: response.statusCode ?? 0,
          data: Buffer.concat(chunks),
          complete,
        });
      };
      response.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
        received += chunk.length;
        if (!acted && received >= afterBytes) {
          acted = true;
          action();
        }
      });
      response.on('end', () => {
        finish(true);
      });
      response.on('error', () => {
        finish(false);
      });
      response.on('aborted', () => {
        finish(false);
      });
    });
    req.on('error', () => {
      resolve({ status: 0, data: Buffer.alloc(0), complete: false });
    });
  });
}

class FakeRoute implements DriveTransport {
  private endpoint: string | null;
  private generation = 0;
  private scope = new AbortController();
  private readonly listeners = new Set<(state: NodeRouteState) => void>();
  constructor(endpoint: string | null) {
    this.endpoint = endpoint;
  }
  switchTo(endpoint: string | null): void {
    this.endpoint = endpoint;
    this.generation += 1;
    this.scope.abort(new Error('Hub route changed'));
    this.scope = new AbortController();
    const state: NodeRouteState = {
      endpoint: endpoint === null ? null : { kind: 'lan', url: endpoint },
      routeGeneration: this.generation,
      networkGeneration: 0,
      localSupported: false,
      detail: '',
    };
    for (const listener of this.listeners) listener(state);
  }
  private rewrite(input: string | URL | Request): string {
    if (this.endpoint === null) throw new Error('Hub route is not currently reachable');
    const url = new URL(input instanceof Request ? input.url : input);
    return `${this.endpoint}${url.pathname}${url.search}`;
  }
  readonly fetch: typeof fetch = (input, init) => fetch(this.rewrite(input), init);
  readonly byteStream: DriveTransport['byteStream'] = async (request) => {
    const generation = this.generation;
    const response = await fetch(this.rewrite(request), {
      method: request.method,
      headers: request.headers,
      signal: AbortSignal.any([request.signal, this.scope.signal]),
    });
    return { response, routeGeneration: generation };
  };
  readonly settled = (): Promise<void> => Promise.resolve();
  readonly ready = (): boolean => this.endpoint !== null;
  readonly subscribe: DriveTransport['subscribe'] = (listener) => {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  };
}

async function broker(route: FakeRoute): Promise<HubGuestBroker> {
  const instance = new HubGuestBroker(
    {
      lease: (url): { url: URL; signal: AbortSignal; generation: number } => ({
        url: new URL(url),
        signal: new AbortController().signal,
        generation: 1,
      }),
      failed: (): void => undefined,
      view: { trust: null },
    },
    CANONICAL,
  );
  await instance.start();
  const dispose = registerDriveFamilies(instance, route);
  closers.push(() => {
    dispose();
    instance.close();
  });
  return instance;
}
const target = { canonicalOrigin: CANONICAL, nodeToken: NODE_TOKEN } as const;

describe('drive families on the node broker', () => {
  it('answers 409 for an unknown grant and 403 when a grant is used on another family path', async () => {
    const upstream = await hub();
    const instance = await broker(new FakeRoute(upstream.origin));
    const helper = openHelperGrant(instance, target, 'run-1');
    const unknown = helper.fs.replace(/\/[0-9a-f]{64}$/, `/${'0'.repeat(64)}`);
    expect((await fetch(`${unknown}/x/list`)).status).toBe(409);
    const crossed = helper.fs.replace('/fs/', '/uploads/');
    const refused = await fetch(`${crossed}/x/list`, {
      headers: { authorization: `Bearer ${helper.secret}` },
    });
    expect(refused.status).toBe(403);
    expect(upstream.seen).toHaveLength(0);
  });

  it('adds the node token upstream only and never exposes it in grant urls or other headers', async () => {
    const upstream = await hub();
    const instance = await broker(new FakeRoute(upstream.origin));
    const helper = openHelperGrant(instance, target, 'run-1');
    for (const url of [helper.fs, helper.uploads, helper.secret])
      expect(url).not.toContain(NODE_TOKEN);
    const answer = await fetch(`${helper.fs}/root1/stat?path=%2Fa`, {
      headers: {
        authorization: `Bearer ${helper.secret}`,
        accept: 'application/json',
        cookie: 'private=1',
        'x-forwarded-for': '10.0.0.1',
      },
    });
    expect(answer.status).toBe(200);
    expect(upstream.seen[0]?.url).toBe('/drive/fs/root1/stat?path=%2Fa');
    expect(upstream.seen[0]?.url).not.toContain(NODE_TOKEN);
    expect(upstream.seen[0]?.headers.authorization).toBe(`Bearer ${NODE_TOKEN}`);
    expect(upstream.seen[0]?.headers.accept).toBe('application/json');
    expect(upstream.seen[0]?.headers.cookie).toBeUndefined();
    expect(upstream.seen[0]?.headers['x-forwarded-for']).toBeUndefined();
    expect(answer.headers.get('x-internal')).toBeNull();
  });

  it('refuses a helper request without its secret', async () => {
    const upstream = await hub();
    const instance = await broker(new FakeRoute(upstream.origin));
    const helper = openHelperGrant(instance, target, 'run-1');
    expect((await fetch(`${helper.fs}/root1/list`)).status).toBe(403);
    expect(
      (await fetch(`${helper.fs}/root1/list`, { headers: { authorization: 'Bearer wrong' } }))
        .status,
    ).toBe(403);
    expect(upstream.seen).toHaveLength(0);
  });

  it('lets each family reach only its own hub path and methods', async () => {
    const upstream = await hub();
    const instance = await broker(new FakeRoute(upstream.origin));
    const helper = openHelperGrant(instance, target, 'run-1');
    const auth = { authorization: `Bearer ${helper.secret}` };
    const escaped = await fetch(`${helper.fs}/../uploads/x`, { headers: auth });
    expect([403, 409]).toContain(escaped.status);
    const encoded = await fetch(`${helper.fs}/%2e%2e/uploads/x`, { headers: auth });
    expect([403, 409]).toContain(encoded.status);
    expect(
      (await fetch(`${helper.fs}/root1/x`, { method: 'PUT', headers: auth, body: 'x' })).status,
    ).toBe(403);
    expect((await fetch(`${helper.fs}/root1/x`, { method: 'DELETE', headers: auth })).status).toBe(
      403,
    );
    const file = openFileGrant(instance, target, 'file-1', 'item 1');
    expect((await fetch(`${file}/more`)).status).toBe(403);
    expect((await fetch(file, { method: 'POST', body: 'x' })).status).toBe(403);
    expect(
      upstream.seen.every(
        (entry) => entry.url.startsWith('/drive/') || entry.url.startsWith('/media/'),
      ),
    ).toBe(true);
    expect(upstream.seen.filter((entry) => entry.url.includes('uploads/x'))).toHaveLength(0);
    await fetch(file);
    expect(upstream.seen.at(-1)?.url).toBe('/media/drive/item%201/file');
    await fetch(`${helper.uploads}/abc`, { method: 'HEAD', headers: auth });
    expect(upstream.seen.at(-1)?.url).toBe('/drive/uploads/abc');
  });

  it('serves ranges and heads through the byte stream', async () => {
    const upstream = await hub();
    const instance = await broker(new FakeRoute(upstream.origin));
    const file = openFileGrant(instance, target, 'file-1', 'item1');
    const ranged = await fetch(file, { headers: { range: 'bytes=10-19' } });
    expect(ranged.status).toBe(206);
    expect(ranged.headers.get('content-range')).toBe('bytes 10-19/4096');
    expect(Buffer.from(await ranged.arrayBuffer())).toEqual(FILE.subarray(10, 20));
    const head = await fetch(file, { method: 'HEAD' });
    expect(head.headers.get('content-length')).toBe('4096');
  });

  it('continues a read byte-exact on the new endpoint after a route change', async () => {
    const first = await hub({ stallFirstReadAfter: 1000 });
    const second = await hub();
    const route = new FakeRoute(first.origin);
    const instance = await broker(route);
    const file = openFileGrant(instance, target, 'file-1', 'item1');
    const answer = await streamed(file, 1000, () => {
      route.switchTo(second.origin);
    });
    expect(answer.complete).toBe(true);
    expect(answer.data).toEqual(FILE);
    expect(second.seen).toHaveLength(1);
    expect(second.seen[0]?.headers.range).toBe('bytes=1000-4095');
    expect(second.seen[0]?.headers['if-range']).toBe('"v1"');
    expect(second.seen[0]?.headers.authorization).toBe(`Bearer ${NODE_TOKEN}`);
  });

  it('answers 503 without an endpoint and ends a read that loses its endpoint mid-way', async () => {
    const upstream = await hub({ stallFirstReadAfter: 500 });
    const route = new FakeRoute(upstream.origin);
    const instance = await broker(route);
    const file = openFileGrant(instance, target, 'file-1', 'item1');
    const answer = await streamed(file, 500, () => {
      route.switchTo(null);
    });
    expect(answer.complete).toBe(false);
    expect(answer.data.length).toBeLessThan(FILE.length);
    const refused = await fetch(file);
    expect(refused.status).toBe(503);
    expect(await refused.json()).toEqual({ error: 'Hub route is not currently reachable' });
    const helper = openHelperGrant(instance, target, 'run-2');
    const write = await fetch(`${helper.fs}/root1/mkdir`, {
      method: 'POST',
      headers: { authorization: `Bearer ${helper.secret}` },
      body: '{}',
    });
    expect(write.status).toBe(503);
  });

  it('never re-sends a write after the route changes', async () => {
    const upstream = await hub({ dropWrites: true });
    const other = await hub();
    const route = new FakeRoute(upstream.origin);
    const instance = await broker(route);
    const helper = openHelperGrant(instance, target, 'run-1');
    const pending = fetch(`${helper.fs}/root1/mkdir`, {
      method: 'POST',
      headers: { authorization: `Bearer ${helper.secret}`, 'content-type': 'application/json' },
      body: '{"path":"/a"}',
    });
    const answer = await pending;
    route.switchTo(other.origin);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(answer.status).toBe(502);
    expect(upstream.seen.filter((entry) => entry.method === 'POST')).toHaveLength(1);
    expect(other.seen).toHaveLength(0);
  });

  it('forwards uploads writes with the tus headers and the node token', async () => {
    const upstream = await hub();
    const instance = await broker(new FakeRoute(upstream.origin));
    const helper = openHelperGrant(instance, target, 'run-1');
    const answer = await fetch(`${helper.uploads}/abc`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${helper.secret}`,
        'content-type': 'application/offset+octet-stream',
        'tus-resumable': '1.0.0',
        'upload-offset': '0',
      },
      body: 'chunk',
    });
    expect(answer.status).toBe(200);
    expect(answer.headers.get('set-cookie')).toBeNull();
    expect(upstream.seen[0]).toMatchObject({ method: 'PATCH', url: '/drive/uploads/abc' });
    expect(upstream.seen[0]?.headers['upload-offset']).toBe('0');
    expect(upstream.seen[0]?.headers.authorization).toBe(`Bearer ${NODE_TOKEN}`);
  });

  it('retires a helper run grant and keeps one dav grant per placement', async () => {
    const upstream = await hub();
    const instance = await broker(new FakeRoute(upstream.origin));
    const helper = openHelperGrant(instance, target, 'run-1');
    helper.close();
    const gone = await fetch(`${helper.fs}/root1/list`, {
      headers: { authorization: `Bearer ${helper.secret}` },
    });
    expect(gone.status).toBe(409);
    expect(() => openPlacementDavGrant(instance, target, 'placement-1', 'root1')).toThrow(
      'Broker family dav is not registered',
    );
    instance.register({
      kind: 'dav',
      serve: (exchange) => Promise.resolve(void exchange.response.end('dav')),
    });
    const first = openPlacementDavGrant(instance, target, 'placement-1', 'root1');
    const second = openPlacementDavGrant(instance, target, 'placement-1', 'root1');
    expect((await fetch(first)).status).toBe(409);
    expect(await (await fetch(second)).text()).toBe('dav');
    closePlacementDavGrant(instance, 'placement-1');
    expect((await fetch(second)).status).toBe(409);
  });

  it('refuses a duplicate family and keeps MCP grants on the guest path', async () => {
    const upstream = await hub();
    const instance = await broker(new FakeRoute(upstream.origin));
    expect(() => {
      instance.register({ kind: 'fs', serve: () => Promise.resolve() });
    }).toThrow('already registered');
    const mcp = instance.openMcp(
      'claude',
      { url: new URL('/mcp', CANONICAL).href, pin: null },
      `scg_${'A'.repeat(43)}`,
    );
    expect(mcp).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/guest\/[0-9a-f]{64}\/mcp$/);
    const crossed = mcp.replace('/guest/', '/fs/');
    expect((await fetch(crossed)).status).toBe(403);
  });
});
