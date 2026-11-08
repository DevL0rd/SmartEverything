import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import {
  CHAT_SERVER_PATH,
  SERVER_PORT,
  chatServerPrefix,
  type RelayHeaders,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { projectCallerAuthority } from '../projects/authority';
import { authenticate } from '../server/auth';
import type { RawRoute } from '../server/http-server';
import type { Store } from '../store/store';
import { guarded } from './computer-access';
import type { ComputerDirectory } from './computer-directory';
import type { ComputerService } from './computer-service';
import type { RelayRequest, RelayStreams } from './relay-streams';
import { forwardedHeaders, returnedHeaders } from './server-relay-headers';

const log = new Logger('hub.server-relay');
const METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

export interface ServerRelayOptions {
  readonly store: Store;
  readonly service: ComputerService;
  readonly directory: ComputerDirectory;
}

interface Target {
  readonly relay: RelayStreams;
  readonly prefix: string;
  readonly port: number;
}

function target(
  options: ServerRelayOptions,
  request: IncomingMessage,
  params: Readonly<Record<string, string>>,
): Promise<Target> {
  return guarded(() => {
    const caller = authenticate(options.store, request, 'member', false);
    const chatId = params['chatId'] ?? '';
    const computerId = params['computerId'] ?? '';
    const port = SERVER_PORT.parse(Number(params['port']));
    projectCallerAuthority(options.store, caller, chatId);
    options.service.access.device(computerId, options.service.viewer(caller));
    const relay = options.directory.byDevice(computerId).relay;
    return { relay, port, prefix: chatServerPrefix(chatId, { computerId, port }) };
  });
}

function pathOf(request: IncomingMessage, prefix: string): string {
  const rest = (request.url ?? '').slice(prefix.length);
  return rest.startsWith('/') ? rest : `/${rest}`;
}

function requestOf(request: IncomingMessage, found: Target, websocket: boolean): RelayRequest {
  return {
    port: found.port,
    method: request.method ?? 'GET',
    path: pathOf(request, found.prefix),
    headers: forwardedHeaders(request.headers, found.port),
    websocket,
  };
}

function relayHttp(request: IncomingMessage, response: ServerResponse, found: Target): void {
  let started = false;
  const stream = found.relay.start(requestOf(request, found, false), {
    head: (status, headers) => {
      started = true;
      response.writeHead(status, returnedHeaders(headers, found.prefix, found.port));
    },
    data: (chunk) => {
      response.write(chunk);
    },
    end: () => {
      response.end();
    },
    failed: (reason) => {
      log.warn('relay.failed', { reason: reason.slice(0, 300), port: found.port });
      if (started) {
        response.destroy();
        return;
      }
      response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      response.end(`The server on port ${String(found.port)} could not be reached: ${reason}`);
    },
  });
  request.on('data', (chunk: Buffer) => {
    stream.data(chunk, false);
  });
  request.on('end', () => {
    stream.end();
  });
  response.on('close', () => {
    stream.close();
  });
}

function refuse(socket: Duplex, status: number, reason: string): void {
  const body = Buffer.from(reason);
  socket.end(
    `HTTP/1.1 ${String(status)} Relay\r\ncontent-type: text/plain; charset=utf-8\r\ncontent-length: ${String(body.length)}\r\nconnection: close\r\n\r\n${reason}`,
  );
}

function protocolOf(headers: RelayHeaders): string | false {
  const value = headers['sec-websocket-protocol'];
  return typeof value === 'string' && value !== '' ? value : false;
}

function relayServer(headers: RelayHeaders): WebSocketServer {
  const protocol = protocolOf(headers);
  return new WebSocketServer({ noServer: true, handleProtocols: (): string | false => protocol });
}

class SocketBridge {
  private socket: WebSocket | null = null;
  private readonly pending: { readonly chunk: Buffer; readonly text: boolean }[] = [];
  private ended = false;

  deliver(chunk: Buffer, text: boolean): void {
    if (this.socket === null) this.pending.push({ chunk, text });
    else this.socket.send(chunk, { binary: !text });
  }

  attach(socket: WebSocket): void {
    this.socket = socket;
    this.pending.splice(0).forEach(({ chunk, text }) => {
      socket.send(chunk, { binary: !text });
    });
    if (this.ended) socket.close();
  }

  finish(code: number): void {
    this.ended = true;
    this.socket?.close(code);
  }
}

function relaySocket(
  upgrade: { readonly request: IncomingMessage; readonly socket: Duplex; readonly head: Buffer },
  found: Target,
): void {
  const bridge = new SocketBridge();
  let opened = false;
  const stream = found.relay.start(requestOf(upgrade.request, found, true), {
    head: (status, headers) => {
      if (status !== 101) {
        refuse(upgrade.socket, status, `The server answered ${String(status)}.`);
        stream.close();
        return;
      }
      opened = true;
      const relayed = relayServer(headers);
      relayed.handleUpgrade(upgrade.request, upgrade.socket, upgrade.head, (socket) => {
        relayed.close();
        bridge.attach(socket);
        socket.on('message', (data: RawData, binary: boolean) => {
          stream.data(
            Array.isArray(data)
              ? Buffer.concat(data)
              : Buffer.isBuffer(data)
                ? data
                : Buffer.from(data),
            !binary,
          );
        });
        socket.on('close', () => {
          stream.close();
        });
      });
    },
    data: (chunk, text) => {
      bridge.deliver(chunk, text);
    },
    end: () => {
      bridge.finish(1000);
    },
    failed: (reason) => {
      log.warn('relay.socket_failed', { reason: reason.slice(0, 300), port: found.port });
      if (opened) bridge.finish(1011);
      else refuse(upgrade.socket, 502, reason);
    },
  });
  upgrade.socket.on('close', () => {
    if (!opened) stream.close();
  });
}

export function serverRelayRoutes(options: ServerRelayOptions): readonly RawRoute[] {
  return METHODS.map((method) => ({
    method,
    path: CHAT_SERVER_PATH,
    handle: async (request, response, params): Promise<void> => {
      relayHttp(request, response, await target(options, request, params));
    },
    ...(method === 'GET'
      ? {
          upgrade: async (request, socket, head, params): Promise<void> => {
            relaySocket({ request, socket, head }, await target(options, request, params));
          },
        }
      : {}),
  }));
}
