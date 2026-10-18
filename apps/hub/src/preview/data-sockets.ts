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
import type { Logger } from '@smarteverything/logging';
import type { ComputerNodeAccess } from '../computers/node-access';
import { bearerOf } from '../server/http';
import { isHtmlPreview } from './sources';
import type { ViewerLease } from './leases';
import { socketText } from './socket-text';
interface Pending {
  readonly lease: ViewerLease;
  readonly ticket: string;
  readonly accept: (stream: Duplex) => void;
  readonly fail: (error: unknown) => void;
  readonly timer: NodeJS.Timeout;
  readonly cleanup: () => void;
  readonly signal: AbortSignal;
}
const OPEN_MS = 15_000;
export class PreviewDataSockets {
  private readonly server = new WebSocketServer({
    noServer: true,
    maxPayload: PREVIEW_CHUNK_BYTES,
    perMessageDeflate: false,
    handleProtocols: (p): string | false =>
      p.has(NODE_PREVIEW_PROTOCOL) ? NODE_PREVIEW_PROTOCOL : false,
  });
  private readonly pending = new Map<string, Pending>();
  private readonly active = new Map<string, () => void>();
  constructor(
    private readonly access: ComputerNodeAccess,
    private readonly log: Logger,
  ) {}
  open(lease: ViewerLease): Promise<Duplex> {
    const signal = lease.abort.signal;
    signal.throwIfAborted();
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
        this.fail(id, cause);
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
      this.accept(ws, identity.device_id);
    });
  }
  private accept(ws: WebSocket, deviceId: string): void {
    const deadline = setTimeout(() => {
      ws.terminate();
    }, OPEN_MS);
    deadline.unref();
    ws.once('message', (raw, binary) => {
      try {
        if (binary)
          throw new ApiError('invalid_request', 'Preview handshake must be a JSON control.');
        const frame = NODE_PREVIEW_CONNECT.parse(JSON.parse(socketText(raw)));
        const pending = this.pending.get(frame.stream_id);
        if (pending?.ticket !== frame.ticket || deviceId !== frame.device_id)
          throw new ApiError(
            'forbidden',
            'Preview stream ticket is unknown or belongs to another node.',
          );
        this.bind(frame, pending);
        clearTimeout(deadline);
        clearTimeout(pending.timer);
        this.pending.delete(frame.stream_id);
        pending.cleanup();
        this.attach(ws, frame.stream_id, pending);
      } catch (cause) {
        this.log.warn('preview.relay_handshake_refused', {
          error_name: cause instanceof Error ? cause.name : 'unknown',
        });
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
    this.active.set(id, close);
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
  private fail(id: string, error: unknown): void {
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
    for (const close of this.active.values()) close();
    this.server.close();
  }
}
