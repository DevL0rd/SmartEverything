import { randomUUID } from 'expo-crypto';
import { Logger } from '@smarteverything/logging';
import {
  BEARER_PROTOCOL_PREFIX,
  EMBEDDED_BROWSER_PROTOCOL,
  EMBEDDED_BROWSER_PATH,
  EMBEDDED_BROWSER_SCOPE,
  EMBEDDED_BROWSER_RESPONSE,
  EMBEDDED_BROWSER_RESULT,
  EMBEDDED_BROWSER_ACTION_NAMES,
  type EmbeddedBrowserAction,
  type EmbeddedBrowserScope,
  type EmbeddedBrowserRequest,
  type EmbeddedBrowserResult,
} from '@smarteverything/domain';
import { openHubSocket, type HubSocket } from '../../../../api/connection/hub-socket';
import { routeFor } from '../../../../api/connection/active-route';
import type { ServerConnection } from '../../../../api/connection/storage';
import { DiagnosticsRecovery } from '../browser-diagnostics-recovery';
import { embeddedBrowserSnapshot } from '../browser-embedded-snapshot';
import type { BrowserTabs } from '../browser-tabs';
const log = new Logger('app.embedded-browser');
const MAX_PENDING = 8;
const MAX_RECEIPTS = 256;
interface Task {
  readonly request: EmbeddedBrowserRequest;
  readonly abort: AbortController;
  readonly result: Promise<EmbeddedBrowserResult>;
}
export class EmbeddedBrowserChannel {
  private socket: HubSocket | null = null;
  private scope: EmbeddedBrowserScope | null = null;
  private accepted = false;
  private disposed = false;
  private readonly tasks = new Map<string, Task>();
  private readonly pending = new Set<string>();
  private readonly recovery: DiagnosticsRecovery;
  private readonly stopRoute: () => void;
  constructor(
    private readonly connection: ServerConnection,
    private readonly owner: Omit<EmbeddedBrowserScope, 'generation'>,
    private readonly tabs: BrowserTabs,
    private readonly reveal: () => void,
  ) {
    this.recovery = new DiagnosticsRecovery({
      connect: (): void => {
        this.connect();
      },
      eligible: (): boolean => !this.disposed,
      connected: (): boolean => this.socket !== null,
    });
    this.stopRoute = routeFor(connection).state.subscribe(() => {
      this.recovery.resume();
    });
    this.recovery.resume();
  }
  private connect(): void {
    if (this.disposed || this.socket !== null) return;
    try {
      const socket = openHubSocket(this.connection, EMBEDDED_BROWSER_PATH, [
        EMBEDDED_BROWSER_PROTOCOL,
        `${BEARER_PROTOCOL_PREFIX}${this.connection.token}`,
      ]);
      this.socket = socket;
      this.scope = EMBEDDED_BROWSER_SCOPE.parse({ ...this.owner, generation: randomUUID() });
      socket.onopen = (): void => {
        if (this.socket !== socket) return;
        this.recovery.opened();
        this.send(socket, { kind: 'register', scope: this.scope });
      };
      socket.onmessage = (event): void => {
        this.received(socket, event.data);
      };
      socket.onclose = (): void => {
        this.closed(socket);
      };
      socket.onerror = (): void => {
        this.closed(socket);
        socket.close();
      };
    } catch (cause) {
      log.warn('browser.connect_failed', {
        failure: cause instanceof Error ? cause.name : 'TransportFailure',
      });
      this.recovery.closed();
    }
  }
  private received(socket: HubSocket, data: unknown): void {
    if (socket !== this.socket) return;
    try {
      if (typeof data !== 'string')
        throw new BrowserControllerError('Browser control expects JSON text.');
      const raw: unknown = JSON.parse(data);
      const response = EMBEDDED_BROWSER_RESPONSE.parse(raw);
      switch (response.kind) {
        case 'accepted':
          this.accept(response.scope);
          this.accepted = true;
          return;
        case 'perform':
          this.perform(socket, response.request);
          return;
        case 'cancel':
          this.tasks.get(response.requestId)?.abort.abort();
          return;
        case 'refused':
          log.warn('browser.registration_refused', { reason: response.reason });
          this.dispose();
          return;
      }
    } catch (cause) {
      log.warn('browser.protocol_failed', {
        failure: cause instanceof Error ? cause.name : 'ProtocolFailure',
      });
      this.dispose();
    }
  }
  private accept(scope: EmbeddedBrowserScope): void {
    if (JSON.stringify(scope) !== JSON.stringify(this.scope))
      throw new BrowserControllerError('Browser registration acknowledgement changed owner.');
  }
  private perform(socket: HubSocket, request: EmbeddedBrowserRequest): void {
    if (!this.accepted || JSON.stringify(request.scope) !== JSON.stringify(this.scope))
      throw new BrowserControllerError('Browser request changed registration.');
    const previous = this.tasks.get(request.requestId);
    if (previous !== undefined) {
      if (JSON.stringify(previous.request) !== JSON.stringify(request))
        throw new BrowserControllerError('Browser request ID changed action.');
      this.answer(socket, previous);
      return;
    }
    if (
      this.pending.size >= MAX_PENDING ||
      (request.operation.kind === 'edit' && this.tasks.size >= MAX_RECEIPTS)
    )
      throw new BrowserControllerError('The browser request limit was reached.');
    const abort = new AbortController();
    const task = { request, abort, result: this.run(request, abort.signal) };
    this.pending.add(request.requestId);
    this.tasks.set(request.requestId, task);
    this.answer(socket, task);
  }
  private async run(
    request: EmbeddedBrowserRequest,
    signal: AbortSignal,
  ): Promise<EmbeddedBrowserResult> {
    signal.throwIfAborted();
    const tabId =
      request.operation.kind === 'edit' ? await this.edit(request.operation.action, signal) : null;
    signal.throwIfAborted();
    const snapshot = {
      ...request.scope,
      ...embeddedBrowserSnapshot(this.tabs),
      capabilities: [...EMBEDDED_BROWSER_ACTION_NAMES],
    };
    return EMBEDDED_BROWSER_RESULT.parse({ snapshot, tabId });
  }
  private async edit(action: EmbeddedBrowserAction, signal: AbortSignal): Promise<string | null> {
    if (action.kind === 'open' || action.kind === 'select') this.reveal();
    const performed = this.tabs.perform(action, signal);
    const tabId =
      action.kind === 'reorder'
        ? null
        : action.kind === 'open'
          ? this.tabs.read().selectedId
          : action.tabId;
    await performed;
    return tabId;
  }
  private answer(socket: HubSocket, task: Task): void {
    void task.result
      .then(
        (result) => {
          if (this.current(socket, task))
            this.send(socket, { kind: 'result', request: task.request, result, reason: null });
        },
        (cause: unknown) => {
          if (this.current(socket, task))
            this.send(socket, {
              kind: 'result',
              request: task.request,
              result: null,
              reason:
                cause instanceof Error ? cause.message.slice(0, 4096) : 'Browser action failed.',
            });
        },
      )
      .finally(() => {
        if (this.tasks.get(task.request.requestId) !== task) return;
        this.pending.delete(task.request.requestId);
        if (task.request.operation.kind === 'read') this.tasks.delete(task.request.requestId);
      });
  }
  private current(socket: HubSocket, task: Task): boolean {
    return this.socket === socket && !task.abort.signal.aborted && !this.disposed;
  }
  private send(socket: HubSocket, value: unknown): void {
    if (this.socket !== socket || socket.readyState !== WebSocket.OPEN) return;
    try {
      socket.send(JSON.stringify(value));
    } catch (cause) {
      log.warn('browser.send_failed', {
        failure: cause instanceof Error ? cause.name : 'TransportFailure',
      });
      this.closed(socket);
      socket.close();
    }
  }
  private closed(socket: HubSocket): void {
    if (this.socket !== socket) return;
    this.socket = null;
    this.accepted = false;
    this.cancel();
    this.recovery.closed();
  }
  private cancel(): void {
    for (const task of this.tasks.values()) task.abort.abort();
    this.tasks.clear();
    this.pending.clear();
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopRoute();
    this.recovery.dispose();
    this.cancel();
    this.socket?.close();
    this.socket = null;
  }
}
class BrowserControllerError extends Error {
  override readonly name = 'BrowserControllerError';
}
