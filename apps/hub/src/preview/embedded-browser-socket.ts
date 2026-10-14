import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import {
  ApiError,
  EMBEDDED_BROWSER_PATH,
  EMBEDDED_BROWSER_PROTOCOL,
  EMBEDDED_BROWSER_MESSAGE,
  type EmbeddedBrowserScope,
  type EmbeddedBrowserRequest,
  type EmbeddedBrowserResult,
} from '@smarteverything/domain';
import type { Store } from '../store/store';
import { socketClient } from '../server/socket-auth';
import type { EmbeddedBrowserControllers } from './embedded-browser-controllers';
interface Pending {
  readonly request: EmbeddedBrowserRequest;
  readonly resolve: (result: EmbeddedBrowserResult) => void;
  readonly reject: (cause: Error) => void;
  readonly timer: NodeJS.Timeout;
}
interface Receipt {
  readonly input: string;
  readonly result: Promise<EmbeddedBrowserResult>;
}
const MAX_PENDING = 8;
const MAX_RECEIPTS = 256;
const TIMEOUT_MS = 30_000;
class BrowserConnection {
  private scope: EmbeddedBrowserScope | null = null;
  private readonly pending = new Map<string, Pending>();
  private readonly receipts = new Map<string, Receipt>();
  constructor(
    private readonly socket: WebSocket,
    private readonly clientId: string,
    private readonly controllers: EmbeddedBrowserControllers,
  ) {
    socket.on('message', (data, binary) => {
      this.received(data, binary);
    });
    socket.once('close', () => {
      this.ended();
    });
    socket.on('error', this.close);
  }
  readonly close = (): void => {
    this.socket.close(1001, 'Browser authority ended');
  };
  private received(data: RawData, binary: boolean): void {
    try {
      if (binary)
        throw new ApiError('invalid_request', 'Browser control accepts bounded JSON only.');
      const raw: unknown = JSON.parse(socketText(data));
      const message = EMBEDDED_BROWSER_MESSAGE.parse(raw);
      if (message.kind === 'register') {
        if (this.scope !== null || message.scope.clientId !== this.clientId)
          throw new ApiError(
            'forbidden',
            'A browser socket registers its exact authenticated client once.',
          );
        this.controllers.register({
          scope: message.scope,
          perform: this.perform,
          close: this.close,
        });
        this.scope = message.scope;
        this.send({ kind: 'accepted', scope: this.scope });
      } else this.answer(message.request, message.result, message.reason);
    } catch (cause) {
      this.send({
        kind: 'refused',
        reason:
          cause instanceof Error ? cause.message.slice(0, 4096) : 'Browser control rejected input.',
      });
      this.close();
    }
  }
  private readonly perform = (request: EmbeddedBrowserRequest): Promise<EmbeddedBrowserResult> => {
    const input = JSON.stringify(request);
    const previous = this.receipts.get(request.requestId);
    if (previous !== undefined)
      return previous.input === input
        ? previous.result
        : Promise.reject(
            new ApiError('conflict', 'The request ID was reused for another browser action.'),
          );
    if (
      this.pending.size >= MAX_PENDING ||
      (request.operation.kind === 'edit' && this.receipts.size >= MAX_RECEIPTS) ||
      this.socket.readyState !== WebSocket.OPEN
    )
      return Promise.reject(
        new ApiError(
          'conflict',
          'The browser is busy, disconnected or its bounded request history is full.',
        ),
      );
    const result = new Promise<EmbeddedBrowserResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.requestId);
        this.send({ kind: 'cancel', requestId: request.requestId });
        reject(
          new ApiError(
            'upstream_failed',
            'Browser delivery is unknown; read current tabs without replaying the edit.',
          ),
        );
      }, TIMEOUT_MS);
      this.pending.set(request.requestId, { request, resolve, reject, timer });
      this.send({ kind: 'perform', request });
    });
    if (request.operation.kind === 'edit') this.receipts.set(request.requestId, { input, result });
    return result;
  };
  private answer(
    request: EmbeddedBrowserRequest,
    result: EmbeddedBrowserResult | null,
    reason: string | null,
  ): void {
    const task = this.pending.get(request.requestId);
    if (task === undefined) return;
    if (
      JSON.stringify(task.request) !== JSON.stringify(request) ||
      (result !== null && !sameBrowserOwner(result.snapshot, task.request.scope))
    )
      throw new ApiError(
        'forbidden',
        'The browser result changed its initiating registration or request.',
      );
    this.pending.delete(request.requestId);
    clearTimeout(task.timer);
    if (reason !== null) task.reject(new ApiError('conflict', reason));
    else if (result === null)
      task.reject(new ApiError('invalid_request', 'Browser acknowledgement has no snapshot.'));
    else task.resolve(result);
  }
  private ended(): void {
    this.controllers.disconnect(this.close);
    for (const task of this.pending.values()) {
      clearTimeout(task.timer);
      task.reject(
        new ApiError(
          'conflict',
          'Browser delivery is unknown after disconnection; read current tabs without replaying edits.',
        ),
      );
    }
    this.pending.clear();
    this.receipts.clear();
  }
  private send(value: unknown): void {
    if (this.socket.readyState !== WebSocket.OPEN) return;
    if (this.socket.bufferedAmount > 1024 * 1024) {
      this.close();
      return;
    }
    this.socket.send(JSON.stringify(value));
  }
}
export class EmbeddedBrowserSockets {
  private readonly server = new WebSocketServer({
    noServer: true,
    maxPayload: 256 * 1024,
    perMessageDeflate: false,
    handleProtocols: (offered): string | false =>
      offered.has(EMBEDDED_BROWSER_PROTOCOL) ? EMBEDDED_BROWSER_PROTOCOL : false,
  });
  constructor(
    private readonly store: Store,
    private readonly controllers: EmbeddedBrowserControllers,
  ) {}
  upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    const client = socketClient(
      this.store,
      request,
      EMBEDDED_BROWSER_PROTOCOL,
      EMBEDDED_BROWSER_PATH,
    );
    this.server.handleUpgrade(request, socket, head, (connected) => {
      new BrowserConnection(connected, client.id, this.controllers);
    });
  }
  stop(): void {
    for (const client of this.server.clients) client.close();
    this.server.close();
  }
}
function socketText(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(data)).toString('utf8');
  return data.toString('utf8');
}

function sameBrowserOwner(left: EmbeddedBrowserScope, right: EmbeddedBrowserScope): boolean {
  return (
    left.viewerId === right.viewerId &&
    left.generation === right.generation &&
    left.clientId === right.clientId &&
    left.profileId === right.profileId &&
    left.chatId === right.chatId
  );
}
