import { randomBytes, randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, createWebSocketStream, type WebSocket } from 'ws';
import {
  ApiError,
  NODE_PREVIEW_CONNECT,
  NODE_PREVIEW_PROTOCOL,
  PREVIEW_CHUNK_BYTES,
} from '@smarteverything/domain';
import type { ComputerNodeAccess } from '../computers/node-access';
import { bearerOf } from '../server/http';
import { isHtmlPreview } from './sources';
import type { PreviewLeases, ViewerLease } from './leases';
interface Pending {
  readonly lease: ViewerLease;
  readonly ticket: string;
  readonly accept: (stream: Duplex) => void;
  readonly fail: (error: Error) => void;
  readonly timer: NodeJS.Timeout;
  readonly cleanup: () => void;
  readonly signal: AbortSignal;
}
const OPEN_MS = 15_000;
const PER_HOST_STREAMS = 16;
const TOTAL_STREAMS = 128;
export class PreviewDataSockets {
  private readonly server = new WebSocketServer({
    noServer: true,
    maxPayload: PREVIEW_CHUNK_BYTES,
    perMessageDeflate: false,
    handleProtocols: (p): string | false =>
      p.has(NODE_PREVIEW_PROTOCOL) ? NODE_PREVIEW_PROTOCOL : false,
  });
  private readonly pending = new Map<string, Pending>();
  private readonly active = new Map<
    string,
    { readonly lease: ViewerLease; readonly close: () => void }
  >();
  constructor(
    private readonly access: ComputerNodeAccess,
    private readonly leases: PreviewLeases,
  ) {}
  open(lease: ViewerLease, requester?: AbortSignal): Promise<Duplex> {
    this.leases.validate(lease);
    const signal = AbortSignal.any([
      lease.abort.signal,
      ...(requester === undefined ? [] : [requester]),
    ]);
    signal.throwIfAborted();
    const count = [...this.pending.values(), ...this.active.values()].filter(
      (s) => s.lease === lease,
    ).length;
    if (count >= PER_HOST_STREAMS || this.pending.size + this.active.size >= TOTAL_STREAMS)
      throw new ApiError('conflict', 'The preview stream limit was reached.');
    const id = randomUUID();
    const ticket = randomBytes(32).toString('hex');
    return new Promise((accept, fail) => {
      const timer = setTimeout(() => {
        this.fail(
          id,
          new ApiError('upstream_failed', 'The published service did not open its relay.'),
        );
      }, OPEN_MS);
      timer.unref();
      const cancelled = (): void => {
        this.fail(id, new ApiError('forbidden', 'Preview lease was revoked.'));
      };
      signal.addEventListener('abort', cancelled, { once: true });
      this.pending.set(id, {
        lease,
        signal,
        ticket,
        accept,
        fail,
        timer,
        cleanup: (): void => {
          signal.removeEventListener('abort', cancelled);
        },
      });
      try {
        this.dispatch(lease, id, ticket);
      } catch (cause) {
        this.fail(
          id,
          cause instanceof Error ? cause : new ApiError('internal', 'Relay dispatch failed.'),
        );
      }
    });
  }
  private dispatch(lease: ViewerLease, id: string, ticket: string): void {
    const p = lease.publication;
    if (isHtmlPreview(p))
      throw new ApiError('forbidden', 'HTML documents do not open computer network streams.');
    p.send({
      type: 'preview_open',
      device_id: p.view.target.device_id,
      generation: p.view.generation,
      runtime_instance: p.view.runtime_instance,
      stream_id: id,
      ticket,
      publication_id: p.view.id,
      revision: p.view.revision,
      service_handle: p.serviceHandle,
      expires_at: new Date(p.writerExpires()).toISOString(),
    });
  }
  upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    const token = bearerOf(request);
    const identity = this.access.authenticate(token);
    if (
      request.headers['sec-websocket-protocol'] !== NODE_PREVIEW_PROTOCOL ||
      request.headers['sec-websocket-extensions'] !== undefined
    )
      throw new ApiError(
        'invalid_request',
        'Preview data requires preview-v1 without compression.',
      );
    this.server.handleUpgrade(request, socket, head, (ws) => {
      this.accept(ws, identity.device_id, token);
    });
  }
  private accept(ws: WebSocket, deviceId: string, token: string | null): void {
    const deadline = setTimeout(() => {
      ws.terminate();
    }, OPEN_MS);
    deadline.unref();
    ws.once('message', (raw, binary) => {
      try {
        if (binary)
          throw new ApiError('invalid_request', 'Preview handshake must be a JSON control.');
        const bytes = Buffer.isBuffer(raw)
          ? raw
          : Array.isArray(raw)
            ? Buffer.concat(raw)
            : Buffer.from(raw);
        const frame = NODE_PREVIEW_CONNECT.parse(JSON.parse(bytes.toString('utf8')));
        const pending = this.pending.get(frame.stream_id);
        if (pending?.ticket !== frame.ticket || deviceId !== frame.device_id)
          throw new ApiError(
            'forbidden',
            'Preview stream ticket is unknown or belongs to another node.',
          );
        if (this.access.authenticate(token).device_id !== deviceId)
          throw new ApiError('forbidden', 'The preview node pairing changed during handshake.');
        this.bind(frame, pending);
        clearTimeout(deadline);
        clearTimeout(pending.timer);
        this.pending.delete(frame.stream_id);
        pending.cleanup();
        this.attach(ws, frame.stream_id, pending);
      } catch (cause) {
        if (!(cause instanceof Error))
          throw new ApiError('internal', 'Preview handshake failed without an Error.');
        ws.terminate();
      }
    });
    ws.on('error', () => {
      ws.terminate();
    });
    ws.once('close', () => {
      clearTimeout(deadline);
    });
  }
  private attach(ws: WebSocket, id: string, pending: Pending): void {
    const duplex = createWebSocketStream(ws, { highWaterMark: PREVIEW_CHUNK_BYTES });
    const close = (): void => {
      duplex.destroy();
      ws.terminate();
      this.active.delete(id);
    };
    this.active.set(id, { lease: pending.lease, close });
    pending.signal.addEventListener('abort', close, { once: true });
    ws.on('message', (_data, isBinary) => {
      if (!isBinary) close();
    });
    duplex.on('error', close);
    duplex.once('close', () => {
      this.active.delete(id);
      pending.signal.removeEventListener('abort', close);
    });
    pending.accept(duplex);
  }
  private bind(frame: ReturnType<typeof NODE_PREVIEW_CONNECT.parse>, pending: Pending): void {
    this.leases.validate(pending.lease);
    pending.signal.throwIfAborted();
    const publication = pending.lease.publication;
    if (isHtmlPreview(publication))
      throw new ApiError('forbidden', 'HTML has no computer relay binding.');
    const p = publication.view;
    if (
      frame.device_id !== p.target.device_id ||
      frame.generation !== p.generation ||
      frame.runtime_instance !== p.runtime_instance
    )
      throw new ApiError('forbidden', 'The preview relay runtime was replaced.');
  }
  private fail(id: string, error: Error): void {
    const p = this.pending.get(id);
    if (p === undefined) return;
    clearTimeout(p.timer);
    this.pending.delete(id);
    p.cleanup();
    p.fail(error);
  }
  stop(): void {
    for (const id of this.pending.keys())
      this.fail(id, new ApiError('conflict', 'The preview relay stopped.'));
    for (const stream of this.active.values()) stream.close();
    this.server.close();
  }
}
