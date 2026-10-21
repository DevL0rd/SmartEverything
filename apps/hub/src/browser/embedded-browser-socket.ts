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
import { Logger, messageOf } from '@smarteverything/logging';
import type { Store } from '../store/store';
import { socketText } from './socket-text';
import { clientSocketsOf } from '../server/client-sockets';
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
const TIMEOUT_MS = 30_000;
const log = new Logger('hub.browser');
class BrowserConnection {
  private scope: EmbeddedBrowserScope | null = null;
  private readonly pending = new Map<string, Pending>();
  private readonly receipts = new Map<string, Receipt>();
  private readonly openedAt = performance.now();
  private performed = 0;
  private answered = 0;
  private failed = 0;
  constructor(
    private readonly socket: WebSocket,
    private readonly clientId: string,
    private readonly controllers: EmbeddedBrowserControllers,
  ) {
    log.info('browser.socket_opened', { clientId });
    socket.on('message', (data, binary) => {
      this.received(data, binary);
    });
    socket.once('close', (code) => {
      this.ended(code);
    });
    socket.on('error', (cause) => {
      log.warn('browser.socket_failed', {
        clientId: this.clientId,
        errorName: cause.name,
        reason: cause.message.slice(0, 200),
      });
      this.close();
    });
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
        log.info('browser.registered', {
          clientId: this.clientId,
          viewerId: message.scope.viewerId,
          generation: message.scope.generation,
          profileId: message.scope.profileId,
          chatId: message.scope.chatId,
        });
        this.send({ kind: 'accepted', scope: this.scope });
      } else this.answer(message.request, message.result, message.reason);
    } catch (cause) {
      log.warn('browser.input_refused', {
        clientId: this.clientId,
        registered: this.scope !== null,
        binary,
        bytes: rawBytes(data),
        errorName: cause instanceof Error ? cause.name : typeof cause,
        reason: messageOf(cause).slice(0, 200),
      });
      this.send({
        kind: 'refused',
        reason: messageOf(cause).slice(0, 4096),
      });
      this.close();
    }
  }
  private readonly perform = (request: EmbeddedBrowserRequest): Promise<EmbeddedBrowserResult> => {
    const input = JSON.stringify(request);
    const previous = this.receipts.get(request.requestId);
    this.performed += 1;
    log.debug('browser.action_requested', {
      clientId: this.clientId,
      requestId: request.requestId,
      kind: request.operation.kind,
      replay: previous !== undefined,
      pending: this.pending.size,
    });
    if (previous !== undefined)
      return previous.input === input
        ? previous.result
        : Promise.reject(
            new ApiError('conflict', 'The request ID was reused for another browser action.'),
          );
    if (this.socket.readyState !== WebSocket.OPEN) {
      log.warn('browser.action_refused', {
        clientId: this.clientId,
        requestId: request.requestId,
        reason: 'disconnected',
        readyState: this.socket.readyState,
      });
      return Promise.reject(new ApiError('conflict', 'The browser is disconnected.'));
    }
    const result = new Promise<EmbeddedBrowserResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.failed += 1;
        log.warn('browser.action_timed_out', {
          clientId: this.clientId,
          requestId: request.requestId,
          kind: request.operation.kind,
          timeoutMs: TIMEOUT_MS,
        });
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
    if (task === undefined) {
      log.debug('browser.answer_unmatched', {
        clientId: this.clientId,
        requestId: request.requestId,
      });
      return;
    }
    this.answered += 1;
    log.debug('browser.action_answered', {
      clientId: this.clientId,
      requestId: request.requestId,
      ok: result !== null && reason === null,
      hasReason: reason !== null,
    });
    this.pending.delete(request.requestId);
    clearTimeout(task.timer);
    if (
      JSON.stringify(task.request) !== JSON.stringify(request) ||
      (result !== null && !sameBrowserOwner(result.snapshot, task.request.scope))
    )
      task.reject(
        new ApiError(
          'forbidden',
          'The browser result changed its initiating registration or request.',
        ),
      );
    else if (reason !== null) task.reject(new ApiError('conflict', reason));
    else if (result === null)
      task.reject(new ApiError('invalid_request', 'Browser acknowledgement has no snapshot.'));
    else task.resolve(result);
  }
  private ended(code: number): void {
    log.info('browser.socket_closed', {
      clientId: this.clientId,
      closeCode: code,
      registered: this.scope !== null,
      openMs: Math.round(performance.now() - this.openedAt),
      performed: this.performed,
      answered: this.answered,
      failed: this.failed,
      abandoned: this.pending.size,
    });
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
    log.debug('browser.upgrade_accepted', { clientId: client.id });
    this.server.handleUpgrade(request, socket, head, (connected) => {
      clientSocketsOf(this.store).track(client.id, connected);
      new BrowserConnection(connected, client.id, this.controllers);
    });
  }
  stop(): void {
    for (const client of this.server.clients) client.close();
    this.server.close();
  }
}

function rawBytes(data: RawData): number {
  if (Array.isArray(data)) return data.reduce((total, part) => total + part.length, 0);
  return data instanceof ArrayBuffer ? data.byteLength : data.length;
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
