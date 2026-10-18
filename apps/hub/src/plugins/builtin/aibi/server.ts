import {
  createServer as createHttpServer,
  type Server as HttpServer,
  type ServerOptions,
} from 'node:http';
import { createServer as createHttpsServer, type Server as HttpsServer } from 'node:https';
import type { Server, Socket } from 'node:net';
import type { PluginNetwork } from '../../plugin-listen';
import { Upstream, type Cloud } from './cloud';
import { requestListener, unreadable, type Routes } from './connection';

const ALL_ADDRESSES = '0.0.0.0';

const LOOPBACK = new Set(['127.0.0.1', '::1']);
const IPV4_MAPPED = /^::ffff:/;
const REJECTED_CERTIFICATE = /certificate unknown|unknown ca|bad certificate/i;
const NEVER = 0;

const HTTP_OPTIONS: ServerOptions = { keepAliveTimeout: NEVER, requestTimeout: NEVER };

export interface RobotServerOptions {
  readonly network: Pick<PluginNetwork, 'listenTcp'>;
  readonly httpPort: number;
  readonly httpsPort: number;
  readonly key: string;
  readonly cert: string;
  readonly cloud: Cloud;
}

function secureServerFor(
  options: RobotServerOptions,
  routes: Routes,
  upstream: Upstream,
): HttpsServer {
  const secure = createHttpsServer(
    { ...HTTP_OPTIONS, key: options.key, cert: options.cert, minVersion: 'TLSv1.2' },
    requestListener('https', routes, upstream),
  );
  secure.on('tlsClientError', (error, socket) => {
    const from = (socket.remoteAddress ?? 'unknown').replace(IPV4_MAPPED, '');
    if (LOOPBACK.has(from)) {
      return;
    }
    const reason = REJECTED_CERTIFICATE.test(error.message)
      ? 'it rejected the certificate this server offered'
      : error.message;
    routes.failed(`TLS handshake with ${from} failed: ${reason}`);
  });
  return secure;
}

function plainServerFor(routes: Routes, upstream: Upstream): HttpServer {
  return createHttpServer(HTTP_OPTIONS, requestListener('http', routes, upstream));
}

export class RobotServer {
  private upstreams: Upstream[] = [];
  private listeners: Server[] = [];
  private readonly sockets = new Set<Socket>();

  constructor(private readonly routes: Routes) {}

  async start(options: RobotServerOptions): Promise<void> {
    const { routes } = this;
    const plainUpstream = new Upstream('http', options.cloud);
    const secureUpstream = new Upstream('https', options.cloud);
    this.upstreams.push(plainUpstream, secureUpstream);
    const secure = secureServerFor(options, routes, secureUpstream);
    const plain = plainServerFor(routes, plainUpstream);
    for (const app of [secure, plain]) {
      app.on('clientError', (error, socket) => {
        unreadable(routes, error, socket);
      });
    }
    await this.accept(options.network, options.httpsPort, secure);
    await this.accept(options.network, options.httpPort, plain);
  }

  private async accept(
    network: Pick<PluginNetwork, 'listenTcp'>,
    port: number,
    app: HttpServer | HttpsServer,
  ): Promise<void> {
    const listener = await network.listenTcp(port, ALL_ADDRESSES);
    this.listeners.push(listener);
    listener.on('connection', (socket) => {
      this.sockets.add(socket);
      socket.once('close', () => {
        this.sockets.delete(socket);
      });
      app.emit('connection', socket);
    });
  }

  stop(): void {
    this.sockets.forEach((socket) => {
      socket.destroy();
    });
    this.sockets.clear();
    this.upstreams.forEach((upstream) => {
      upstream.close();
    });
    this.listeners.forEach((listener) => {
      listener.close();
    });
    this.upstreams = [];
    this.listeners = [];
  }

  get running(): boolean {
    return this.listeners.length === 2;
  }
}
