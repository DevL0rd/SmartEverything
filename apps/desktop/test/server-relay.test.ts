import { once } from 'node:events';
import {
  createServer,
  request,
  type ClientRequest,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
} from 'node:http';
import type { Duplex } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NativePageOpen } from '@smarteverything/domain';
import { DesktopServerRelay } from '../src/html-preview/server-relay.js';

const CHAT = '00000000-0000-4000-8000-000000000001';
const COMPUTER = '00000000-0000-4000-8000-000000000002';
const PREFIX = `/api/ai/chats/${CHAT}/servers/${COMPUTER}/5173`;
const closers: (() => void)[] = [];

afterEach(() => {
  for (const close of closers.splice(0)) close();
});

interface Seen {
  readonly url: string | undefined;
  readonly headers: IncomingHttpHeaders;
}
async function upstream(): Promise<{ origin: string; seen: Seen[] }> {
  const seen: Seen[] = [];
  const server: Server = createServer((incoming, response) => {
    seen.push({ url: incoming.url, headers: incoming.headers });
    response.writeHead(302, { location: `${PREFIX}/next`, 'x-game': 'snake' });
    response.end('hello');
  });
  server.on('upgrade', (incoming: IncomingMessage, socket: Duplex) => {
    seen.push({ url: incoming.url, headers: incoming.headers });
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: relayed\r\n\r\n',
    );
    socket.pipe(socket);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  closers.push(() => {
    server.closeAllConnections();
    server.close();
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  return { origin: `http://127.0.0.1:${String(address.port)}`, seen };
}
async function relay(origin: string): Promise<{
  relay: DesktopServerRelay;
  controller: AbortController;
  failed: ReturnType<typeof vi.fn>;
}> {
  const input: NativePageOpen = {
    scopeId: 'scope',
    authorization: 'Bearer secret',
    binding: {
      scopeId: 'scope',
      canonicalOrigin: origin,
      hubId: 'a'.repeat(64),
      principalId: 'principal',
      credentialKind: 'client',
      credentialGeneration: 1,
    },
    page: { chatId: CHAT, path: '/', server: { computerId: COMPUTER, port: 5173 } },
  };
  const controller = new AbortController();
  const failed = vi.fn();
  const owned = new DesktopServerRelay(
    {
      authorize: (): void => undefined,
      lease: (_scope, url): { url: URL } => ({ url: new URL(url) }),
      failed,
    },
    { input, owner: 1, signal: controller.signal },
    { computerId: COMPUTER, port: 5173 },
  );
  await owned.start();
  closers.push(() => {
    controller.abort();
  });
  return { relay: owned, controller, failed };
}
function fetchVia(
  owned: DesktopServerRelay,
  path: string,
  headers: Record<string, string>,
): Promise<{ status: number; headers: IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const outgoing = request(`${owned.origin}${path}`, { headers }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => {
        body += chunk;
      });
      response.on('end', () => {
        resolve({ status: response.statusCode ?? 0, headers: response.headers, body });
      });
    });
    outgoing.on('error', reject);
    outgoing.end();
  });
}
function upgraded(outgoing: ClientRequest): Promise<{ response: IncomingMessage; socket: Duplex }> {
  return new Promise((resolve) => {
    outgoing.once('upgrade', (response: IncomingMessage, socket: Duplex) => {
      resolve({ response, socket });
    });
  });
}
function responded(outgoing: ClientRequest): Promise<IncomingMessage> {
  return new Promise((resolve) => {
    outgoing.once('response', resolve);
  });
}
function received(socket: Duplex): Promise<string> {
  return new Promise((resolve) => {
    socket.once('data', (chunk: Buffer) => {
      resolve(chunk.toString());
    });
  });
}
function key(owned: DesktopServerRelay): string {
  return `${owned.gate.name}=${owned.gate.value}`;
}

describe('the desktop relay for a chat-shared server', () => {
  it('relays a page request through the hub with the page credential and without the page key', async () => {
    const hub = await upstream();
    const { relay: owned } = await relay(hub.origin);
    const answer = await fetchVia(owned, '/index.html?level=2', {
      cookie: `theme=dark; ${key(owned)}`,
      origin: owned.origin,
    });
    expect(answer).toMatchObject({ status: 302, body: 'hello' });
    expect(answer.headers.location).toBe('/next');
    expect(answer.headers['x-game']).toBe('snake');
    expect(hub.seen[0]?.url).toBe(`${PREFIX}/index.html?level=2`);
    expect(hub.seen[0]?.headers.authorization).toBe('Bearer secret');
    expect(hub.seen[0]?.headers.cookie).toBe('theme=dark');
    expect(hub.seen[0]?.headers.origin).toBeUndefined();
  });

  it('refuses requests without the page key or for another host', async () => {
    const hub = await upstream();
    const { relay: owned } = await relay(hub.origin);
    expect((await fetchVia(owned, '/', {})).status).toBe(403);
    expect((await fetchVia(owned, '/', { cookie: `${owned.gate.name}=wrong` })).status).toBe(403);
    expect(
      (await fetchVia(owned, '/', { cookie: key(owned), host: 'evil.example:80' })).status,
    ).toBe(403);
    expect(hub.seen).toHaveLength(0);
  });

  it('passes a websocket through to the hub and back', async () => {
    const hub = await upstream();
    const { relay: owned, controller } = await relay(hub.origin);
    const outgoing = request(`${owned.origin}/ws`, {
      headers: {
        connection: 'Upgrade',
        upgrade: 'websocket',
        'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
        'sec-websocket-version': '13',
        cookie: key(owned),
        origin: owned.origin,
      },
    });
    outgoing.end();
    const { response, socket } = await upgraded(outgoing);
    expect(hub.seen[0]?.headers.origin).toBeUndefined();
    expect(response.statusCode).toBe(101);
    expect(response.headers['sec-websocket-accept']).toBe('relayed');
    expect(hub.seen[0]?.url).toBe(`${PREFIX}/ws`);
    expect(hub.seen[0]?.headers['sec-websocket-key']).toBe('dGhlIHNhbXBsZSBub25jZQ==');
    expect(hub.seen[0]?.headers.authorization).toBe('Bearer secret');
    const echo = received(socket);
    socket.write('ping');
    expect(await echo).toBe('ping');
    controller.abort();
    await once(socket, 'close');
  });

  it('refuses a websocket without the page key', async () => {
    const hub = await upstream();
    const { relay: owned } = await relay(hub.origin);
    const outgoing = request(`${owned.origin}/ws`, {
      headers: { connection: 'Upgrade', upgrade: 'websocket' },
    });
    outgoing.end();
    const response = await responded(outgoing);
    response.resume();
    expect(response.statusCode).toBe(403);
    expect(hub.seen).toHaveLength(0);
  });

  it('reports an unreachable hub to the route authority', async () => {
    const hub = await upstream();
    const { relay: owned, failed } = await relay(hub.origin.replace(/:\d+$/u, ':1'));
    expect((await fetchVia(owned, '/', { cookie: key(owned) })).status).toBe(502);
    expect(failed).toHaveBeenCalledWith('scope', undefined);
  });
});
