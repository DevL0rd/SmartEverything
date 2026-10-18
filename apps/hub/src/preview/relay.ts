import { Agent } from 'node:http';
import type { ClientRequestArgs, IncomingMessage, ServerResponse } from 'node:http';
import { Duplex } from 'node:stream';
import { createProxyServer, type ProxyServer } from 'http-proxy-3';
import { ApiError } from '@smarteverything/domain';
import type { PreviewDataSockets } from './data-sockets';
import { frameAncestors, sourceRequestHeaders } from './headers';
import type { ViewerLease } from './leases';
import type { Publication } from './publications';
import { isHtmlPreview } from './sources';

type Fail = (target: ServerResponse | Duplex, cause: unknown) => void;

const SOCKET_METHODS = {
  setTimeout: (): void => undefined,
  setNoDelay: (): void => undefined,
  setKeepAlive: (): void => undefined,
  ref: (): void => undefined,
  unref: (): void => undefined,
};

class RelayAgent extends Agent {
  constructor(private readonly open: () => Promise<Duplex>) {
    super({ keepAlive: true });
  }
  override createConnection(
    _options: ClientRequestArgs,
    callback?: (err: Error | null, stream: Duplex) => void,
  ): undefined {
    this.open().then(
      (stream) => callback?.(null, Object.assign(stream, SOCKET_METHODS)),
      (cause: unknown) => {
        const error =
          cause instanceof Error
            ? cause
            : new ApiError('internal', 'The preview relay failed without an Error.');
        callback?.(error, new Duplex());
      },
    );
    return undefined;
  }
}

export class PreviewRelay {
  private readonly proxies = new WeakMap<ViewerLease, ProxyServer>();
  constructor(
    private readonly data: PreviewDataSockets,
    private readonly ancestors: () => readonly string[],
    private readonly fail: Fail,
  ) {}
  web(request: IncomingMessage, response: ServerResponse, lease: ViewerLease): void {
    const headers = {
      ...sourceRequestHeaders(request.headers, originsOf(lease)),
      connection: 'keep-alive',
    };
    this.proxy(lease).web(request, response, { headers }, (cause) => {
      this.fail(response, cause);
    });
  }
  ws(request: IncomingMessage, socket: Duplex, head: Buffer, lease: ViewerLease): void {
    const headers = sourceRequestHeaders(request.headers, originsOf(lease));
    this.proxy(lease).ws(request, socket, head, { headers }, (cause) => {
      this.fail(socket, cause);
    });
  }
  private proxy(lease: ViewerLease): ProxyServer {
    const existing = this.proxies.get(lease);
    if (existing !== undefined) return existing;
    const agent = new RelayAgent(() => this.data.open(lease));
    lease.abort.signal.addEventListener(
      'abort',
      () => {
        agent.destroy();
      },
      { once: true },
    );
    const proxy = createProxyServer({
      target: serviceOf(lease).view.source_origin,
      agent,
      changeOrigin: true,
      cookieDomainRewrite: { '*': '' },
    });
    const origins = originsOf(lease);
    proxy.on('proxyRes', (response) => {
      Object.assign(response.headers, {
        'content-security-policy': [
          response.headers['content-security-policy'] ?? [],
          frameAncestors(this.ancestors()),
        ]
          .flat()
          .join(', '),
        'referrer-policy': 'no-referrer',
        ...redirectOf(response.headers.location, origins),
      });
    });
    this.proxies.set(lease, proxy);
    return proxy;
  }
}

function serviceOf(lease: ViewerLease): Publication {
  const publication = lease.publication;
  if (isHtmlPreview(publication))
    throw new ApiError('forbidden', 'HTML documents cannot relay local network requests.');
  return publication;
}

function originsOf(lease: ViewerLease): { readonly preview: string; readonly source: string } {
  return {
    preview: `https://${lease.host}`,
    source: serviceOf(lease).view.source_origin,
  };
}

function redirectOf(
  location: string | undefined,
  origins: { readonly preview: string; readonly source: string },
): { readonly location?: string } {
  if (location === undefined) return {};
  const target = new URL(location, origins.source);
  if (target.origin !== origins.source) return {};
  return { location: `${origins.preview}${target.pathname}${target.search}${target.hash}` };
}
