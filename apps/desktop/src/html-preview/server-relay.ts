import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  createServer,
  request as requestHttp,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type OutgoingHttpHeaders,
  type Server,
  type ServerResponse,
} from 'node:http';
import { request as requestHttps } from 'node:https';
import type { Duplex } from 'node:stream';
import {
  BrowserPolicyError,
  SERVER_PAGE_PATH,
  chatServerPrefix,
  type ChatServer,
} from '@smarteverything/domain';
import type { HubLease } from '@smarteverything/hub/client-network/lease';
import { Logger } from '@smarteverything/logging';
import type { NativeHtmlPage, NativeHtmlTransportPort } from './page.js';

const log = new Logger('desktop.server-relay');
const KEY_PREFIX = 'se_page_';
const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']);
const HOP = new Set([
  'authorization',
  'accept-encoding',
  'connection',
  'keep-alive',
  'proxy-connection',
  'transfer-encoding',
  'upgrade',
  'te',
  'trailer',
  'host',
  'origin',
]);
const RETURNED_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-connection',
  'transfer-encoding',
  'upgrade',
  'trailer',
]);

export interface ServerGate {
  readonly origin: string;
  readonly name: string;
  readonly value: string;
}
interface Outbound {
  readonly lease: HubLease;
  readonly headers: OutgoingHttpHeaders;
  readonly signal: AbortSignal;
}

export class DesktopServerRelay {
  readonly #key = randomBytes(32).toString('hex');
  readonly #server: Server;
  readonly #prefix: string;
  readonly #sockets = new Set<Duplex>();
  #port = 0;
  constructor(
    private readonly transport: NativeHtmlTransportPort,
    private readonly page: NativeHtmlPage,
    server: ChatServer,
  ) {
    this.#prefix = chatServerPrefix(page.input.page.chatId, server);
    this.#server = createServer((request, response) => {
      this.#serve(request, response);
    });
    this.#server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
      this.#upgrade(request, socket, head);
    });
    page.signal.addEventListener('abort', () => {
      this.close();
    });
  }
  async start(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.#server.once('error', reject);
      this.#server.listen(0, '127.0.0.1', () => {
        this.#server.off('error', reject);
        resolve();
      });
    });
    const address = this.#server.address();
    if (address === null || typeof address === 'string')
      throw new BrowserPolicyError('The page listener has no loopback port.');
    this.#port = address.port;
    if (this.page.signal.aborted) this.close();
    this.page.signal.throwIfAborted();
  }
  get origin(): string {
    return `http://127.0.0.1:${String(this.#port)}`;
  }
  get gate(): ServerGate {
    return { origin: this.origin, name: this.#cookieName(), value: this.#key };
  }
  close(): void {
    this.#server.close();
    this.#server.closeAllConnections();
    for (const socket of this.#sockets) socket.destroy();
    this.#sockets.clear();
  }
  #cookieName(): string {
    return `${KEY_PREFIX}${String(this.#port)}`;
  }
  #admits(cookie: string | undefined): boolean {
    const expected = Buffer.from(`${this.#cookieName()}=${this.#key}`);
    return (cookie ?? '')
      .split(';')
      .map((part) => Buffer.from(part.trim()))
      .some((part) => part.length === expected.length && timingSafeEqual(part, expected));
  }
  #outbound(request: IncomingMessage): Outbound {
    const path = request.url ?? '';
    if (!METHODS.has(request.method ?? ''))
      throw new BrowserPolicyError('This method is not relayed.');
    if (!SERVER_PAGE_PATH.safeParse(path).success)
      throw new BrowserPolicyError('This is not a page path.');
    if (request.headers.host !== `127.0.0.1:${String(this.#port)}`)
      throw new BrowserPolicyError('This page answers only its own address.');
    if (!this.#admits(request.headers.cookie))
      throw new BrowserPolicyError('The request does not carry the page key.');
    const { input, owner } = this.page;
    this.transport.authorize(input.scopeId, input.authorization, owner);
    const lease = this.transport.lease(
      input.scopeId,
      `${input.binding.canonicalOrigin}${this.#prefix}${path}`,
      input.binding,
    );
    const signals = [this.page.signal];
    if (lease.signal !== undefined) signals.push(lease.signal);
    const signal = AbortSignal.any(signals);
    signal.throwIfAborted();
    return { lease, signal, headers: forwarded(request.headers, input.authorization) };
  }
  #failed(signal: AbortSignal): void {
    if (!signal.aborted) this.transport.failed?.(this.page.input.scopeId, undefined);
  }
  #serve(request: IncomingMessage, response: ServerResponse): void {
    let outbound: Outbound;
    try {
      outbound = this.#outbound(request);
    } catch (cause) {
      answer(response, 403, `This page request was refused: ${reason(cause)}`);
      return;
    }
    const { lease, headers, signal } = outbound;
    const create = lease.url.protocol === 'https:' ? requestHttps : requestHttp;
    const upstream = create(lease.url, {
      method: request.method,
      agent: lease.agent,
      signal,
      headers,
    });
    upstream.on('response', (reply) => {
      response.writeHead(reply.statusCode ?? 502, this.#returned(reply.headers));
      reply.pipe(response);
      reply.once('error', () => {
        response.destroy();
      });
    });
    upstream.on('error', (cause) => {
      this.#failed(signal);
      log.warn('relay.request_failed', { error_name: cause.name });
      if (response.headersSent) response.destroy();
      else answer(response, 502, `The server could not be reached: ${cause.message}`);
    });
    response.once('close', () => {
      if (!response.writableFinished) upstream.destroy();
    });
    request.pipe(upstream);
  }
  #returned(headers: IncomingHttpHeaders): OutgoingHttpHeaders {
    const result: OutgoingHttpHeaders = {};
    for (const [name, value] of Object.entries(headers)) {
      if (value === undefined || RETURNED_HOP.has(name)) continue;
      result[name] =
        name === 'location' && typeof value === 'string' && value.startsWith(`${this.#prefix}/`)
          ? value.slice(this.#prefix.length)
          : value;
    }
    return result;
  }
  #upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    let outbound: Outbound;
    try {
      if (request.method !== 'GET' || request.headers.upgrade?.toLowerCase() !== 'websocket')
        throw new BrowserPolicyError('Only WebSocket upgrades are relayed.');
      outbound = this.#outbound(request);
    } catch (cause) {
      refuse(socket, 403, `This page socket was refused: ${reason(cause)}`);
      return;
    }
    const { lease, headers, signal } = outbound;
    this.#track(socket);
    const create = lease.url.protocol === 'https:' ? requestHttps : requestHttp;
    const upstream = create(lease.url, {
      method: 'GET',
      agent: lease.agent,
      signal,
      headers: { ...headers, connection: 'Upgrade', upgrade: 'websocket' },
    });
    upstream.on('upgrade', (reply: IncomingMessage, remote: Duplex, remoteHead: Buffer) => {
      this.#bridge(socket, head, signal, { reply, remote, remoteHead });
    });
    upstream.on('response', (reply) => {
      reply.resume();
      refuse(socket, reply.statusCode ?? 502, `The server answered ${String(reply.statusCode)}.`);
    });
    upstream.on('error', (cause) => {
      this.#failed(signal);
      log.warn('relay.socket_failed', { error_name: cause.name });
      refuse(socket, 502, `The server socket could not be opened: ${cause.message}`);
    });
    socket.once('close', () => {
      upstream.destroy();
    });
    upstream.end();
  }
  #bridge(
    socket: Duplex,
    head: Buffer,
    signal: AbortSignal,
    upstream: {
      readonly reply: IncomingMessage;
      readonly remote: Duplex;
      readonly remoteHead: Buffer;
    },
  ): void {
    const { reply, remote, remoteHead } = upstream;
    this.#track(remote);
    const lines = ['HTTP/1.1 101 Switching Protocols'];
    for (let index = 0; index + 1 < reply.rawHeaders.length; index += 2)
      lines.push(`${String(reply.rawHeaders[index])}: ${String(reply.rawHeaders[index + 1])}`);
    socket.write(`${lines.join('\r\n')}\r\n\r\n`);
    if (remoteHead.length > 0) socket.write(remoteHead);
    if (head.length > 0) remote.write(head);
    const finish = (): void => {
      socket.destroy();
      remote.destroy();
    };
    signal.addEventListener('abort', finish, { once: true });
    remote.once('close', finish);
    socket.once('close', finish);
    remote.once('error', finish);
    socket.once('error', finish);
    remote.pipe(socket);
    socket.pipe(remote);
  }
  #track(socket: Duplex): void {
    this.#sockets.add(socket);
    socket.once('close', () => {
      this.#sockets.delete(socket);
    });
  }
}
function forwarded(headers: IncomingHttpHeaders, authorization: string): OutgoingHttpHeaders {
  const result: OutgoingHttpHeaders = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined || HOP.has(name)) continue;
    if (name === 'cookie') {
      const kept = withoutPageKey(Array.isArray(value) ? value.join('; ') : value);
      if (kept !== '') result[name] = kept;
      continue;
    }
    result[name] = value;
  }
  return { ...result, authorization, 'accept-encoding': 'identity' };
}
function withoutPageKey(cookie: string): string {
  return cookie
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part !== '' && !part.startsWith(KEY_PREFIX))
    .join('; ');
}
function reason(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'unknown';
}
function answer(response: ServerResponse, status: number, text: string): void {
  response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', connection: 'close' });
  response.end(text);
}
function refuse(socket: Duplex, status: number, text: string): void {
  if (socket.destroyed) return;
  const body = Buffer.from(text);
  socket.end(
    `HTTP/1.1 ${String(status)} Relay\r\ncontent-type: text/plain; charset=utf-8\r\ncontent-length: ${String(body.length)}\r\nconnection: close\r\n\r\n${text}`,
  );
}
