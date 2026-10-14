import { z } from 'zod';
import { request as httpRequest } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Duplex } from 'node:stream';
import { ApiError } from '@smarteverything/domain';
import type { ViewerLease, PreviewLeases } from './leases';
import type { PreviewDataSockets } from './data-sockets';
import { mappedHeaders } from './headers';
import { isHtmlPreview } from './sources';
const WEBSOCKET_CREDENTIALS = z.object({
  key: z.string().regex(/^[+/0-9A-Za-z]{22}==$/),
  version: z.literal('13'),
  protocol: z.string().min(1).optional(),
});
interface Upgrade {
  readonly request: IncomingMessage;
  readonly socket: Duplex;
  readonly head: Buffer;
  readonly lease: ViewerLease;
}
function upgradeHeaders(
  request: IncomingMessage,
  lease: ViewerLease,
): ReturnType<typeof mappedHeaders> {
  if (
    request.method !== 'GET' ||
    request.headers.upgrade?.toLowerCase() !== 'websocket' ||
    request.headers['sec-websocket-extensions'] !== undefined
  )
    throw new ApiError('forbidden', 'Unsupported preview upgrade or compression.');
  if (isHtmlPreview(lease.publication))
    throw new ApiError('forbidden', 'HTML cannot upgrade a network connection.');
  const headers = mappedHeaders(
    request.headers,
    `https://${lease.host}`,
    lease.publication.view.source_origin,
  );
  const credentials = WEBSOCKET_CREDENTIALS.parse({
    key: request.headers['sec-websocket-key'],
    version: request.headers['sec-websocket-version'],
    protocol: request.headers['sec-websocket-protocol'],
  });
  headers['sec-websocket-key'] = credentials.key;
  headers['sec-websocket-version'] = credentials.version;
  if (credentials.protocol !== undefined) headers['sec-websocket-protocol'] = credentials.protocol;
  headers.connection = 'Upgrade';
  headers.upgrade = 'websocket';
  return headers;
}
export function previewPath(value: string | undefined): string {
  if (
    value === undefined ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\r\n\\]/.test(value)
  )
    throw new ApiError('invalid_request', 'Preview requires an origin-form path.');
  return value;
}
export function previewRequester(
  request: IncomingMessage,
  target: ServerResponse | Duplex,
  leaseSignal: AbortSignal,
): AbortSignal {
  const abort = new AbortController();
  const socket = target instanceof Duplex ? target : undefined;
  const disconnect = (): void => {
    request.removeListener('close', requestClosed);
    target.removeListener('close', disconnect);
    target.removeListener('error', disconnect);
    socket?.removeListener('end', disconnect);
    abort.abort(new ApiError('conflict', 'The preview requester disconnected.'));
  };
  const requestClosed = (): void => {
    if (!request.complete) disconnect();
  };
  request.once('close', requestClosed);
  target.once('close', disconnect);
  target.once('error', disconnect);
  socket?.once('end', disconnect);
  if (
    target.destroyed ||
    socket?.readableEnded === true ||
    (request.destroyed && !request.complete)
  )
    disconnect();
  return AbortSignal.any([leaseSignal, abort.signal]);
}
export async function upgradePreview(
  input: Upgrade,
  data: PreviewDataSockets,
  leases: PreviewLeases,
): Promise<void> {
  const { request, socket, lease } = input;
  const path = previewPath(request.url);
  const headers = upgradeHeaders(request, lease);
  const signal = previewRequester(request, socket, lease.abort.signal);
  const stream = await data.open(lease, signal);
  if (socket.destroyed) {
    stream.destroy();
    return;
  }
  signal.throwIfAborted();
  if (stream.destroyed)
    throw new ApiError('upstream_failed', 'The preview relay closed during admission.');
  const upstream = httpRequest({
    method: 'GET',
    path,
    createConnection: () => stream,
    headers,
    signal,
  });
  upstream.once('upgrade', (response, remote, extra) => {
    try {
      leases.validate(lease);
      bridge(input, { response, remote, extra });
    } catch (cause) {
      remote.destroy(
        cause instanceof Error
          ? cause
          : new ApiError('internal', 'Preview upgrade failed without an Error.'),
      );
      socket.destroy();
    }
  });
  upstream.once('response', () => {
    socket.destroy();
  });
  upstream.once('error', () => {
    socket.destroy();
  });
  socket.once('close', () => {
    upstream.destroy();
  });
  upstream.end();
}
function bridge(
  input: Upgrade,
  upstream: { readonly response: IncomingMessage; readonly remote: Duplex; readonly extra: Buffer },
): void {
  const { request, socket, lease, head } = input;
  const { response, remote, extra } = upstream;
  const protocol = response.headers['sec-websocket-protocol'];
  const offered = (request.headers['sec-websocket-protocol'] ?? '').split(',').map((v) => v.trim());
  if (
    response.headers['sec-websocket-extensions'] !== undefined ||
    (protocol !== undefined && !offered.includes(protocol))
  ) {
    socket.destroy();
    remote.destroy();
    return;
  }
  socket.write(
    `HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Accept: ${response.headers['sec-websocket-accept'] ?? ''}\r\n${protocol === undefined ? '' : `Sec-WebSocket-Protocol: ${protocol}\r\n`}\r\n`,
  );
  if (extra.length > 0) socket.write(extra);
  if (head.length > 0) remote.write(head);
  socket.pipe(remote).pipe(socket);
  const close = (): void => {
    socket.destroy();
    remote.destroy();
    lease.abort.signal.removeEventListener('abort', close);
  };
  lease.abort.signal.addEventListener('abort', close, { once: true });
  socket.once('close', close);
  remote.once('close', close);
  socket.once('error', close);
  remote.once('error', close);
}
