import type { IncomingMessage, RequestListener, ServerResponse } from 'node:http';
import { buffer } from 'node:stream/consumers';
import type { Duplex } from 'node:stream';
import type { Scheme, Upstream } from './cloud';
import { encode, flatHeaders, type Payload, type Response } from './replies';
import { messageOf } from '@smarteverything/logging';

export interface Head {
  readonly startLine: string;
  readonly headers: Readonly<Record<string, string>>;
}

export interface Message extends Head, Payload {}

export interface Incoming {
  readonly head: Head;
  readonly method: string;
  readonly path: string;
  readonly query: URLSearchParams;
  readonly scheme: Scheme;
  readonly remote: string;
  readonly chunks: () => AsyncIterable<Buffer>;
}

export interface Exchange {
  readonly message: Message;
  readonly method: string;
  readonly path: string;
  readonly query: URLSearchParams;
  readonly scheme: Scheme;
  readonly remote: string;
  readonly forward: (replacement?: Message) => Promise<Response>;
}

export interface Routes {
  readonly streams: (method: string, path: string) => boolean;
  readonly stream: (request: Incoming) => Promise<Response>;
  readonly handle: (exchange: Exchange, response: ServerResponse) => Promise<Response | 'served'>;
  readonly failed: (detail: string) => void;
}

const LOCAL_BASE = 'http://local';
const SERVER_PROBLEM = encode(500, { errcode: 500, errmsg: 'AIBI server problem' });
const BAD_REQUEST = 'HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n';

function send(response: ServerResponse, reply: Response): void {
  response.writeHead(reply.status, {
    ...reply.headers,
    'Content-Length': String(reply.body.length),
  });
  response.end(reply.body);
}

function headOf(request: IncomingMessage): Head {
  return {
    startLine: `${request.method ?? 'GET'} ${request.url ?? '/'} HTTP/${request.httpVersion}`,
    headers: flatHeaders(request.headers),
  };
}

interface Bridge {
  readonly scheme: Scheme;
  readonly routes: Routes;
  readonly upstream: Upstream;
}

function produce(
  bridge: Bridge,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<Response | 'served'> {
  const { scheme, routes, upstream } = bridge;
  const method = request.method ?? 'GET';
  const { pathname: path, searchParams: query } = new URL(request.url ?? '/', LOCAL_BASE);
  const head = headOf(request);
  const remote = request.socket.remoteAddress ?? '';
  if (routes.streams(method, path)) {
    const chunks = (): AsyncIterable<Buffer> => request.iterator({ destroyOnReturn: false });
    return routes.stream({ head, method, path, query, scheme, remote, chunks });
  }
  return buffer(request).then((body) => {
    const message: Message = { ...head, body };
    const forward = (replacement?: Message): Promise<Response> =>
      upstream.send(replacement ?? message);
    return routes.handle({ message, method, path, query, scheme, remote, forward }, response);
  });
}

export function requestListener(
  scheme: Scheme,
  routes: Routes,
  upstream: Upstream,
): RequestListener {
  const bridge: Bridge = { scheme, routes, upstream };
  return (request, response) => {
    produce(bridge, request, response).then(
      (reply) => {
        if (reply !== 'served') {
          send(response, reply);
        }
      },
      (error: unknown) => {
        routes.failed(messageOf(error));
        if (response.headersSent) {
          response.destroy();
        } else {
          send(response, SERVER_PROBLEM);
        }
      },
    );
  };
}

export function unreadable(routes: Routes, error: Error, socket: Duplex): void {
  if (!socket.writable) {
    socket.destroy();
    return;
  }
  routes.failed(messageOf(error));
  socket.end(BAD_REQUEST);
}
