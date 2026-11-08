import type { IncomingMessage } from 'node:http';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import type {
  BrokerExchange,
  BrokerFamily,
  HubGuestBroker,
} from '@smarteverything/hub/client-network/guest-broker';
import type { NodeHubTransport } from '@smarteverything/hub/client-network/node-transport';
import { HubRefusalError } from '@smarteverything/hub/client-network/policy';
import { RouteWatch, answerUnavailable, relayRead, type ReadTransport } from './broker-continue.js';

export type DriveTransport = ReadTransport & Pick<NodeHubTransport, 'fetch' | 'subscribe'>;

interface FamilySpec {
  readonly kind: 'fs' | 'file' | 'uploads';
  readonly methods: ReadonlySet<string>;
  readonly exact: boolean;
  readonly headers: ReadonlySet<string>;
}

const READ_HEADERS = [
  'accept',
  'range',
  'if-range',
  'if-none-match',
  'if-modified-since',
  'user-agent',
] as const;
const TUS_HEADERS = [
  'tus-resumable',
  'upload-offset',
  'upload-length',
  'upload-metadata',
  'upload-concat',
  'upload-defer-length',
  'upload-checksum',
] as const;
const RESPONSE_HEADERS: ReadonlySet<string> = new Set([
  'content-type',
  'content-length',
  'content-range',
  'accept-ranges',
  'etag',
  'last-modified',
  'cache-control',
  'location',
  'retry-after',
  'allow',
  'tus-resumable',
  'tus-version',
  'tus-extension',
  'tus-max-size',
  'upload-offset',
  'upload-length',
  'upload-metadata',
]);

const SPECS: readonly FamilySpec[] = [
  {
    kind: 'fs',
    methods: new Set(['GET', 'HEAD', 'POST']),
    exact: false,
    headers: new Set([...READ_HEADERS, 'content-type']),
  },
  {
    kind: 'file',
    methods: new Set(['GET', 'HEAD']),
    exact: true,
    headers: new Set(READ_HEADERS),
  },
  {
    kind: 'uploads',
    methods: new Set(['HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS']),
    exact: false,
    headers: new Set(['accept', 'user-agent', 'content-type', 'content-length', ...TUS_HEADERS]),
  },
];

function targetUrl(spec: FamilySpec, exchange: BrokerExchange): URL {
  const base = new URL(exchange.grant.url);
  const rest = (exchange.request.url ?? '').slice(exchange.prefix.length);
  const target = new URL(`${exchange.grant.url}${rest}`);
  const inside = spec.exact
    ? target.pathname === base.pathname
    : target.pathname === base.pathname || target.pathname.startsWith(`${base.pathname}/`);
  if (target.origin !== base.origin || !inside)
    throw new HubRefusalError(`${spec.kind} grant reaches only its own hub path`, 403);
  return target;
}

function upstreamHeaders(
  spec: FamilySpec,
  request: IncomingMessage,
  token: string,
): Record<string, string> {
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  for (const [name, value] of Object.entries(request.headers))
    if (typeof value === 'string' && spec.headers.has(name)) headers[name] = value;
  return headers;
}

function responseHeaders(upstream: Response): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [name, value] of upstream.headers)
    if (RESPONSE_HEADERS.has(name)) headers[name] = value;
  return headers;
}

async function relayWrite(
  transport: DriveTransport,
  exchange: BrokerExchange,
  target: { readonly url: URL; readonly method: string; readonly headers: Record<string, string> },
): Promise<void> {
  const { request, response, signal } = exchange;
  if (!transport.ready()) {
    request.resume();
    answerUnavailable(response);
    return;
  }
  const upstream = await transport.fetch(target.url, {
    method: target.method,
    headers: target.headers,
    body: Readable.toWeb(request),
    duplex: 'half',
    signal,
  });
  response.writeHead(upstream.status, responseHeaders(upstream));
  response.flushHeaders();
  if (upstream.body === null) response.end();
  else await pipeline(Readable.fromWeb(upstream.body), response, { signal });
}

async function serveDrive(
  spec: FamilySpec,
  transport: DriveTransport,
  watch: RouteWatch,
  exchange: BrokerExchange,
): Promise<void> {
  const { request, response, signal } = exchange;
  const method = request.method ?? '';
  if (!spec.methods.has(method))
    throw new HubRefusalError(`${spec.kind} grant does not accept ${method}`, 403);
  const url = targetUrl(spec, exchange);
  const headers = upstreamHeaders(spec, request, exchange.grant.token);
  if (method !== 'GET' && method !== 'HEAD') {
    await relayWrite(transport, exchange, { url, method, headers });
    return;
  }
  request.resume();
  await relayRead({
    transport,
    watch,
    url,
    method,
    headers,
    response,
    signal,
    writeHead: (upstream): void => {
      response.writeHead(upstream.status, responseHeaders(upstream));
      response.flushHeaders();
    },
  });
}

export function registerDriveFamilies(
  broker: Pick<HubGuestBroker, 'register'>,
  transport: DriveTransport,
): () => void {
  const watch = new RouteWatch(transport);
  for (const spec of SPECS) {
    const family: BrokerFamily = {
      kind: spec.kind,
      serve: (exchange): Promise<void> => serveDrive(spec, transport, watch, exchange),
    };
    broker.register(family);
  }
  return (): void => {
    watch.close();
  };
}
