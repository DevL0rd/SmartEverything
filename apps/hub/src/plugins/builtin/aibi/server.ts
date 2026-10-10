import type { Server, Socket } from 'node:net';
import { createServer as createSecureServer, type Server as SecureServer } from 'node:tls';
import type { PluginNetwork } from '../../plugin-listen';
import type { Cloud, Scheme } from './cloud';
import { Connection, type Routes } from './connection';

const ALL_ADDRESSES = '0.0.0.0';

const LOOPBACK = new Set(['127.0.0.1', '::1']);
const IPV4_MAPPED = /^::ffff:/;
const REJECTED_CERTIFICATE = /certificate unknown|unknown ca|bad certificate/i;

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
  track: (socket: Socket, scheme: Scheme) => void,
  routes: Routes,
): SecureServer {
  const secure = createSecureServer(
    { key: options.key, cert: options.cert, minVersion: 'TLSv1.2' },
    (socket) => {
      track(socket, 'https');
    },
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

export class RobotServer {
  private readonly sockets = new Set<Socket>();
  private listeners: Server[] = [];

  constructor(private readonly routes: Routes) {}

  async start(options: RobotServerOptions): Promise<void> {
    const track = (socket: Socket, scheme: Scheme): void => {
      this.sockets.add(socket);
      socket.once('close', () => {
        this.sockets.delete(socket);
      });
      new Connection(socket, scheme, this.routes, options.cloud);
    };
    const secure = secureServerFor(options, track, this.routes);
    const https = await options.network.listenTcp(options.httpsPort, ALL_ADDRESSES);
    this.listeners.push(https);
    https.on('connection', (socket) => {
      secure.emit('connection', socket);
    });
    const http = await options.network.listenTcp(options.httpPort, ALL_ADDRESSES);
    this.listeners.push(http);
    http.on('connection', (socket) => {
      track(socket, 'http');
    });
  }

  stop(): void {
    this.sockets.forEach((socket) => {
      socket.destroy();
    });
    this.sockets.clear();
    this.listeners.forEach((listener) => {
      listener.close();
    });
    this.listeners = [];
  }

  get running(): boolean {
    return this.listeners.length === 2;
  }
}
