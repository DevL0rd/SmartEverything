import { createServer as createHttps } from 'node:https';
import { connect, createServer, type Server, type Socket } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Cloud } from '../../../src/plugins/builtin/aibi/cloud';
import type { Routes } from '../../../src/plugins/builtin/aibi/connection';
import { relay } from '../../../src/plugins/builtin/aibi/replies';
import { RobotServer } from '../../../src/plugins/builtin/aibi/server';
import { tlsPair } from '../../../src/plugins/builtin/aibi/tls-cert';

export interface CloudHit {
  readonly head: string;
  readonly body: string;
}

export interface FakeCloud {
  readonly port: number;
  readonly hits: CloudHit[];
  readonly connections: () => number;
  readonly close: () => Promise<void>;
}

const HEAD_END = '\r\n\r\n';

function lengthOf(head: string): number {
  return Number(/^content-length:\s*(\d+)/im.exec(head)?.[1] ?? 0);
}

function chunkedEnd(text: string): number {
  const end = text.indexOf(`0${HEAD_END}`);
  return end === -1 ? -1 : end + 1 + HEAD_END.length;
}

function portOf(server: Server): number {
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('The test server is not listening');
  }
  return address.port;
}

function listening(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve(portOf(server));
    });
  });
}

export async function fakeCloud(
  answer: (hit: CloudHit, socket: Socket) => void,
): Promise<FakeCloud> {
  const hits: CloudHit[] = [];
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    let pending = '';
    socket.on('data', (chunk: Buffer) => {
      pending += chunk.toString('latin1');
      for (;;) {
        const split = pending.indexOf(HEAD_END);
        if (split === -1) {
          return;
        }
        const head = pending.slice(0, split);
        const rest = pending.slice(split + HEAD_END.length);
        const chunked = /^transfer-encoding:\s*chunked/im.test(head);
        const size = chunked ? chunkedEnd(rest) : lengthOf(head);
        if (size === -1 || rest.length < size) {
          return;
        }
        pending = rest.slice(size);
        const hit = { head, body: rest.slice(0, size) };
        hits.push(hit);
        answer(hit, socket);
      }
    });
  });
  const port = await listening(server);
  return {
    port,
    hits,
    connections: () => sockets.size,
    close: () =>
      new Promise((resolve) => {
        sockets.forEach((socket) => {
          socket.destroy();
        });
        server.close(() => {
          resolve();
        });
      }),
  };
}

export interface Rig {
  readonly httpPort: number;
  readonly httpsPort: number;
  readonly cert: string;
  readonly failures: string[];
  readonly stop: () => Promise<void>;
}

export interface RigOptions {
  readonly routes: (failures: string[]) => Routes;
  readonly cloud: (tls: {
    readonly key: string;
    readonly cert: string;
  }) => Promise<Pick<Cloud, 'httpPort' | 'httpsPort'>>;
}

export async function startRig(options: RigOptions): Promise<Rig> {
  const folder = await mkdtemp(join(tmpdir(), 'aibi-rig-'));
  const pair = await tlsPair(folder);
  const failures: string[] = [];
  const opened: Server[] = [];
  const network = {
    listenTcp: async (): Promise<Server> => {
      const server = createServer();
      await listening(server);
      opened.push(server);
      return server;
    },
  };
  const server = new RobotServer(options.routes(failures));
  await server.start({
    network,
    httpPort: 0,
    httpsPort: 0,
    key: pair.key,
    cert: pair.cert,
    cloud: {
      address: () => Promise.resolve('127.0.0.1'),
      ca: pair.cert,
      ...(await options.cloud(pair)),
    },
  });
  const [secure, plain] = opened;
  if (secure === undefined || plain === undefined) {
    throw new Error('The robot server did not open both ports');
  }
  return {
    httpsPort: portOf(secure),
    httpPort: portOf(plain),
    cert: pair.cert,
    failures,
    stop: async (): Promise<void> => {
      server.stop();
      await rm(folder, { recursive: true, force: true });
    },
  };
}

export function secureCloud(
  cert: string,
  key: string,
): Promise<{ port: number; close: () => void }> {
  const server = createHttps({ key, cert }, (_request, response) => {
    response.end('secure answer');
  });
  return listening(server).then((port) => ({
    port,
    close: (): void => {
      server.close();
      server.closeAllConnections();
    },
  }));
}

export function rawExchange(
  port: number,
  request: string | Buffer[],
  until?: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1');
    let received = '';
    socket.on('data', (chunk: Buffer) => {
      received += chunk.toString('latin1');
      if (until !== undefined && received.length >= until) {
        socket.destroy();
        resolve(received);
      }
    });
    socket.on('close', () => {
      resolve(received);
    });
    socket.on('error', reject);
    for (const part of typeof request === 'string' ? [Buffer.from(request, 'latin1')] : request) {
      socket.write(part);
    }
  });
}

export function forwardingRoutes(failures: string[]): Routes {
  return {
    streams: () => false,
    stream: () => Promise.reject(new Error('no stream')),
    handle: async (exchange) => relay(await exchange.forward()),
    failed: (detail) => failures.push(detail),
  };
}
