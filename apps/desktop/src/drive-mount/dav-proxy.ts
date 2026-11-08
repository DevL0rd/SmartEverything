import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import {
  createServer,
  request as httpRequest,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type OutgoingHttpHeaders,
  type Server,
  type ServerResponse,
} from 'node:http';
import { request as httpsRequest } from 'node:https';
import { pipeline } from 'node:stream/promises';
import { Logger } from '@smarteverything/logging';

const log = new Logger('desktop.dav-proxy');

const LOOPBACK = '127.0.0.1';
const SESSION_BYTES = 16;
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);
const REQUEST_OWN_HEADERS = new Set([
  'host',
  'authorization',
  'accept-encoding',
  'destination',
  'if',
]);
const XML_ENTITIES: Readonly<Record<string, string>> = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&amp;': '&',
};
const HREF_ELEMENT =
  /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|(<(?:[A-Za-z_][\w.-]*:)?href(?:\s[^>]*)?>)([^<]*)(?=<)/g;
const IF_RESOURCE_TAG = /(^|\s)<([^<>]+)>(?=\s*\()/g;

export interface DavProxyConfig {
  readonly hubOrigin: string;
  readonly rootId: string;
  readonly token: string;
}

export interface DavProxy {
  readonly url: string;
  readonly port: number;
  readonly stop: () => Promise<void>;
}

export class DavDestinationError extends Error {
  readonly received: string;

  constructor(received: string) {
    super(
      `a WebDAV Destination must name a path inside this mount on the loopback address; received ${received}`,
    );
    this.name = 'DavDestinationError';
    this.received = received;
  }
}

interface Mapping {
  readonly sessionPrefix: string;
  readonly hubPrefix: string;
  readonly hubOrigin: URL;
  readonly token: string;
}

function startsWithFolder(path: string, prefix: string): boolean {
  return path.startsWith(prefix) || `${path}/` === prefix;
}

function sessionToHub(map: Mapping, path: string): string | null {
  if (!startsWithFolder(path, map.sessionPrefix)) return null;
  return map.hubPrefix + path.slice(map.sessionPrefix.length);
}

function hubToSession(map: Mapping, path: string): string | null {
  if (!startsWithFolder(path, map.hubPrefix)) return null;
  return map.sessionPrefix + path.slice(map.hubPrefix.length);
}

function unescapeXml(text: string): string {
  return text.replace(/&(?:lt|gt|quot|apos|amp);/g, (entity) => XML_ENTITIES[entity] ?? entity);
}

function escapeXml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function hubReference(map: Mapping, reference: string): string | null {
  const parsed = new URL(reference, map.hubOrigin);
  const mapped = hubToSession(map, parsed.pathname);
  return mapped === null ? null : mapped + parsed.search;
}

function rewriteHrefs(map: Mapping, xml: string): string {
  return xml.replace(HREF_ELEMENT, (match, open: string | undefined, text: string | undefined) => {
    if (open === undefined || text === undefined) return match;
    const mapped = hubReference(map, unescapeXml(text));
    return mapped === null ? match : `${open}${escapeXml(mapped)}`;
  });
}

function destinationToHub(map: Mapping, value: string, host: string): string {
  const parsed = new URL(value, `http://${host}`);
  const mapped = parsed.host === host ? sessionToHub(map, parsed.pathname) : null;
  if (mapped === null) throw new DavDestinationError(value);
  return new URL(mapped + parsed.search, map.hubOrigin).href;
}

function rewriteIfHeader(map: Mapping, value: string, host: string): string {
  return value.replace(IF_RESOURCE_TAG, (_match, lead: string, tag: string) => {
    const parsed = new URL(tag, `http://${host}`);
    const mapped = sessionToHub(map, parsed.pathname);
    return mapped === null
      ? `${lead}<${tag}>`
      : `${lead}<${new URL(mapped + parsed.search, map.hubOrigin).href}>`;
  });
}

function upstreamHeaders(
  map: Mapping,
  incoming: IncomingHttpHeaders,
  host: string,
): OutgoingHttpHeaders {
  const headers: OutgoingHttpHeaders = {};
  for (const [name, value] of Object.entries(incoming)) {
    if (value === undefined || HOP_BY_HOP.has(name)) continue;
    if (name === 'if' && typeof value === 'string')
      headers[name] = rewriteIfHeader(map, value, host);
    else if (!REQUEST_OWN_HEADERS.has(name)) headers[name] = value;
  }
  if (typeof incoming['destination'] === 'string') {
    headers['destination'] = destinationToHub(map, incoming['destination'], host);
  }
  headers.authorization = `Bearer ${map.token}`;
  headers['accept-encoding'] = 'identity';
  return headers;
}

function responseHeaders(map: Mapping, incoming: IncomingHttpHeaders): OutgoingHttpHeaders {
  const headers: OutgoingHttpHeaders = {};
  for (const [name, value] of Object.entries(incoming)) {
    if (value !== undefined && !HOP_BY_HOP.has(name)) headers[name] = value;
  }
  for (const name of ['location', 'content-location']) {
    const value = incoming[name];
    const mapped = typeof value === 'string' ? hubReference(map, value) : null;
    if (mapped !== null) headers[name] = mapped;
  }
  return headers;
}

async function collect(stream: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks);
}

function carriesXml(headers: IncomingHttpHeaders): boolean {
  return /xml/i.test(headers['content-type'] ?? '');
}

async function relay(
  map: Mapping,
  method: string,
  upstream: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const status = upstream.statusCode ?? 502;
  const headers = responseHeaders(map, upstream.headers);
  if (method === 'HEAD' || !carriesXml(upstream.headers)) {
    res.writeHead(status, headers);
    await pipeline(upstream, res);
    return;
  }
  const body = Buffer.from(rewriteHrefs(map, (await collect(upstream)).toString('utf8')));
  res.writeHead(status, { ...headers, 'content-length': body.length });
  res.end(body);
}

function refuse(res: ServerResponse, status: number): void {
  res.writeHead(status, { 'content-length': 0 });
  res.end();
}

function failed(res: ServerResponse, cause: unknown): void {
  const reason = cause instanceof Error ? cause.name : 'unknown';
  log.warn('dav_proxy.upstream_failed', { reason });
  if (res.headersSent) res.destroy();
  else refuse(res, 502);
}

function forward(map: Mapping, req: IncomingMessage, res: ServerResponse, host: string): void {
  const url = new URL(req.url ?? '/', `http://${host}`);
  const hubPath = sessionToHub(map, url.pathname);
  if (hubPath === null) {
    refuse(res, 404);
    return;
  }
  const method = req.method ?? 'GET';
  const send = map.hubOrigin.protocol === 'https:' ? httpsRequest : httpRequest;
  const upstream = send(
    new URL(hubPath + url.search, map.hubOrigin),
    { method, headers: upstreamHeaders(map, req.headers, host) },
    (response) => {
      log.debug('dav_proxy.responded', { method, status: response.statusCode ?? 0 });
      relay(map, method, response, res).catch((cause: unknown) => {
        failed(res, cause);
      });
    },
  );
  pipeline(req, upstream).catch((cause: unknown) => {
    failed(res, cause);
  });
}

function handler(
  map: Mapping,
  allowedHosts: ReadonlySet<string>,
): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    const host = req.headers.host ?? '';
    if (!allowedHosts.has(host)) {
      refuse(res, 421);
      return;
    }
    try {
      forward(map, req, res, host);
    } catch (cause) {
      if (cause instanceof DavDestinationError) {
        log.warn('dav_proxy.destination_refused', {});
        refuse(res, 502);
        return;
      }
      throw cause;
    }
  };
}

async function listenOnLoopback(server: Server): Promise<number> {
  server.listen(0, LOOPBACK);
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('the WebDAV proxy must listen on a TCP port');
  }
  return address.port;
}

async function closeServer(server: Server): Promise<void> {
  const closed = once(server, 'close');
  server.close();
  server.closeAllConnections();
  await closed;
}

export async function startDavProxy(config: DavProxyConfig): Promise<DavProxy> {
  const session = randomBytes(SESSION_BYTES).toString('hex');
  const map: Mapping = {
    sessionPrefix: `/${session}/`,
    hubPrefix: `/dav/${encodeURIComponent(config.rootId)}/`,
    hubOrigin: new URL(config.hubOrigin),
    token: config.token,
  };
  const server = createServer();
  const port = await listenOnLoopback(server);
  const allowedHosts = new Set([`${LOOPBACK}:${String(port)}`, `localhost:${String(port)}`]);
  server.on('request', handler(map, allowedHosts));
  log.info('dav_proxy.started', { port });
  return {
    url: `http://${LOOPBACK}:${String(port)}${map.sessionPrefix}`,
    port,
    stop: async (): Promise<void> => {
      await closeServer(server);
      log.info('dav_proxy.stopped', { port });
    },
  };
}
