import { once } from 'node:events';
import type { ServerResponse } from 'node:http';
import { Logger } from '@smarteverything/logging';
import type {
  NodeHubTransport,
  RouteBoundResponse,
} from '@smarteverything/hub/client-network/node-transport';
import type { NodeRouteState } from '@smarteverything/hub/client-network/route-authority';

const log = new Logger('desktop.drive-broker');
const CONTENT_RANGE = /^bytes (\d+)-(\d+)\/(?:\d+|\*)$/;
const CONDITIONAL_HEADERS: ReadonlySet<string> = new Set([
  'range',
  'if-range',
  'if-match',
  'if-none-match',
  'if-modified-since',
  'if-unmodified-since',
]);

export type ReadTransport = Pick<NodeHubTransport, 'byteStream' | 'settled' | 'ready'>;

export class RouteUnavailableError extends Error {
  constructor() {
    super('Hub route is not currently reachable');
    this.name = 'RouteUnavailableError';
  }
}

export class RouteWatch {
  private latest = -1;
  private readonly stop: () => void;
  constructor(transport: Pick<NodeHubTransport, 'subscribe'>) {
    this.stop = transport.subscribe((state: NodeRouteState): void => {
      this.latest = state.routeGeneration;
    });
  }
  get generation(): number {
    return this.latest;
  }
  close(): void {
    this.stop();
  }
}

export interface ReadRelay {
  readonly transport: ReadTransport;
  readonly watch: RouteWatch;
  readonly url: URL;
  readonly method: 'GET' | 'HEAD';
  readonly headers: Readonly<Record<string, string>>;
  readonly response: ServerResponse;
  readonly signal: AbortSignal;
  readonly writeHead: (upstream: Response) => void;
}

class Progress {
  constructor(
    public position: number,
    readonly end: number | undefined,
    readonly etag: string | undefined,
    readonly resumable: boolean,
  ) {}
  advance(bytes: number): void {
    this.position += bytes;
  }
}

export function answerUnavailable(response: ServerResponse): void {
  log.warn('broker.route_unavailable', { status: 503 });
  if (response.headersSent) {
    response.destroy();
    return;
  }
  response.writeHead(503, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  response.end(JSON.stringify({ error: new RouteUnavailableError().message }));
}

function issue(
  relay: ReadRelay,
  headers: Readonly<Record<string, string>>,
): Promise<RouteBoundResponse> {
  return relay.transport.byteStream(
    new Request(relay.url, { method: relay.method, headers, signal: relay.signal }),
  );
}

async function awaitRoute(relay: ReadRelay): Promise<void> {
  if (!relay.transport.ready()) await relay.transport.settled();
  if (!relay.transport.ready()) throw new RouteUnavailableError();
}

async function openFirst(relay: ReadRelay): Promise<RouteBoundResponse> {
  if (!relay.transport.ready()) throw new RouteUnavailableError();
  const before = relay.watch.generation;
  try {
    return await issue(relay, relay.headers);
  } catch (cause) {
    if (relay.signal.aborted || relay.watch.generation === before) throw cause;
    await awaitRoute(relay);
    return issue(relay, relay.headers);
  }
}

function strongEtag(upstream: Response): string | undefined {
  const etag = upstream.headers.get('etag');
  return etag === null || etag.startsWith('W/') ? undefined : etag;
}

function progressOf(upstream: Response): Progress {
  const etag = strongEtag(upstream);
  const range = CONTENT_RANGE.exec(upstream.headers.get('content-range') ?? '');
  if (upstream.status === 206)
    return range === null
      ? new Progress(0, undefined, etag, false)
      : new Progress(Number(range[1]), Number(range[2]), etag, etag !== undefined);
  const length = upstream.headers.get('content-length');
  return new Progress(
    0,
    length === null ? undefined : Number(length) - 1,
    etag,
    upstream.status === 200 && etag !== undefined,
  );
}

function continuationHeaders(
  relay: ReadRelay,
  progress: Progress,
): Readonly<Record<string, string>> {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(relay.headers))
    if (!CONDITIONAL_HEADERS.has(name)) headers[name] = value;
  headers['range'] =
    `bytes=${String(progress.position)}-${progress.end === undefined ? '' : String(progress.end)}`;
  if (progress.etag !== undefined) headers['if-range'] = progress.etag;
  return headers;
}

async function pump(
  body: ReadableStream<Uint8Array>,
  relay: ReadRelay,
  progress: Progress,
): Promise<void> {
  const reader = body.getReader();
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) return;
      progress.advance(chunk.value.byteLength);
      if (!relay.response.write(chunk.value))
        await once(relay.response, 'drain', { signal: relay.signal });
    }
  } finally {
    reader.releaseLock();
  }
}

function admitContinuation(second: Response, progress: Progress): void {
  const range = CONTENT_RANGE.exec(second.headers.get('content-range') ?? '');
  if (
    second.status !== 206 ||
    second.body === null ||
    range === null ||
    Number(range[1]) !== progress.position ||
    strongEtag(second) !== progress.etag
  )
    throw new RouteUnavailableError();
}

async function resume(relay: ReadRelay, progress: Progress): Promise<void> {
  await awaitRoute(relay);
  const { response: second } = await issue(relay, continuationHeaders(relay, progress));
  admitContinuation(second, progress);
  if (second.body !== null) await pump(second.body, relay, progress);
}

async function deliver(relay: ReadRelay, first: RouteBoundResponse): Promise<void> {
  const progress = progressOf(first.response);
  const body = first.response.body;
  if (body === null) {
    relay.response.end();
    return;
  }
  try {
    await pump(body, relay, progress);
  } catch (cause) {
    const moved = relay.watch.generation > first.routeGeneration;
    if (relay.signal.aborted || !progress.resumable || !moved) throw cause;
    log.info('broker.read_continued', { position: progress.position });
    await resume(relay, progress);
  }
  relay.response.end();
}

export async function relayRead(relay: ReadRelay): Promise<void> {
  try {
    const first = await openFirst(relay);
    relay.writeHead(first.response);
    if (relay.method === 'HEAD') {
      relay.response.end();
      return;
    }
    await deliver(relay, first);
  } catch (cause) {
    if (cause instanceof RouteUnavailableError) {
      answerUnavailable(relay.response);
      return;
    }
    throw cause;
  }
}
