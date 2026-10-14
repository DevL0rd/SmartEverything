import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import {
  ApiError,
  PREVIEW_DIAGNOSTICS_PATH,
  PREVIEW_DIAGNOSTICS_PROTOCOL,
  PREVIEW_VIEW_MESSAGE,
  PREVIEW_VIEW_SCOPE,
  type PreviewPixels,
  type PREVIEW_BROWSER_REQUEST,
} from '@smarteverything/domain';
import type { z } from 'zod';
import type { Store } from '../store/store';
import { socketClient } from '../server/socket-auth';
import type { PreviewDiagnostics } from './diagnostics';
interface Pending {
  readonly request: z.infer<typeof PREVIEW_BROWSER_REQUEST>;
  readonly resolve: (pixels: PreviewPixels | null) => void;
  readonly reject: (cause: Error) => void;
  readonly timer: NodeJS.Timeout;
}
export class PreviewDiagnosticSockets {
  private readonly server = new WebSocketServer({
    noServer: true,
    maxPayload: 6 * 1024 * 1024,
    perMessageDeflate: false,
    handleProtocols: (offered): string | false =>
      offered.has(PREVIEW_DIAGNOSTICS_PROTOCOL) ? PREVIEW_DIAGNOSTICS_PROTOCOL : false,
  });
  constructor(
    private readonly store: Store,
    private readonly diagnostics: PreviewDiagnostics,
  ) {}
  upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    const client = socketClient(
      this.store,
      request,
      PREVIEW_DIAGNOSTICS_PROTOCOL,
      PREVIEW_DIAGNOSTICS_PATH,
    );
    this.server.handleUpgrade(request, socket, head, (connected) => {
      this.connect(connected, client.id);
    });
  }
  private connect(socket: WebSocket, clientId: string): void {
    const pending = new Map<string, Pending>();
    const close = (): void => {
      socket.close(1001, 'Preview authority ended');
    };
    const capture = (
      request: z.infer<typeof PREVIEW_BROWSER_REQUEST>,
    ): Promise<PreviewPixels | null> => {
      if (pending.size >= 2 || socket.readyState !== WebSocket.OPEN)
        return Promise.reject(
          new ApiError('conflict', 'The viewing device is busy or disconnected.'),
        );
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(request.requestId);
          reject(new ApiError('upstream_failed', 'The viewing device did not answer capture.'));
        }, 15_000);
        pending.set(request.requestId, { request, resolve, reject, timer });
        send(socket, { kind: 'perform', request });
      });
    };
    socket.on('message', (data, binary) => {
      try {
        if (binary)
          throw new ApiError('invalid_request', 'Preview diagnostics only accepts bounded JSON.');
        const raw: unknown = JSON.parse(socketText(data));
        const message = PREVIEW_VIEW_MESSAGE.parse(raw);
        if (message.kind === 'write') {
          if (message.value.scope.clientId !== clientId)
            throw new ApiError('forbidden', 'A viewer cannot report another client.');
          const viewer = this.diagnostics.write(message.value, { capture, close });
          send(socket, {
            kind: 'accepted',
            epoch: viewer.scope.epoch,
            delivery: viewer.shared ? 'shared' : 'none',
          });
        } else this.answer(pending, message);
      } catch (cause) {
        send(socket, {
          kind: 'refused',
          reason:
            cause instanceof Error ? cause.message : 'Preview diagnostics rejected the input.',
        });
        close();
      }
    });
    this.ended(socket, pending, close);
  }
  private ended(socket: WebSocket, pending: Map<string, Pending>, close: () => void): void {
    socket.once('close', () => {
      this.diagnostics.disconnect(close);
      for (const task of pending.values()) {
        clearTimeout(task.timer);
        task.reject(new ApiError('conflict', 'The viewing device disconnected.'));
      }
      pending.clear();
    });
    socket.on('error', close);
  }
  private answer(
    pending: Map<string, Pending>,
    message: Extract<z.infer<typeof PREVIEW_VIEW_MESSAGE>, { kind: 'operation-result' }>,
  ): void {
    const task = pending.get(message.request.requestId);
    if (task === undefined) return;
    if (
      JSON.stringify(PREVIEW_VIEW_SCOPE.parse(message.request.scope)) !==
      JSON.stringify(task.request.scope)
    )
      throw new ApiError('forbidden', 'Capture result changed its initiating view.');
    pending.delete(message.request.requestId);
    clearTimeout(task.timer);
    if (message.reason !== null) task.reject(new ApiError('conflict', message.reason));
    else task.resolve(message.pixels);
  }
  stop(): void {
    for (const client of this.server.clients) client.close();
    this.server.close();
  }
}
function send(socket: WebSocket, value: unknown): void {
  if (socket.readyState !== WebSocket.OPEN)
    throw new ApiError('conflict', 'Preview diagnostics disconnected.');
  if (socket.bufferedAmount > 1024 * 1024) {
    socket.close(1008, 'Preview diagnostics backpressure');
    return;
  }
  socket.send(JSON.stringify(value));
}

function socketText(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(data)).toString('utf8');
  return data.toString('utf8');
}
