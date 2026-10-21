import { randomUUID } from 'expo-crypto';
import type { z } from 'zod';
import { Logger, background } from '@smarteverything/logging';
import {
  BEARER_PROTOCOL_PREFIX,
  EMBEDDED_BROWSER_PROTOCOL,
  EMBEDDED_BROWSER_PATH,
  EMBEDDED_BROWSER_SCOPE,
  EMBEDDED_BROWSER_RESPONSE,
  EMBEDDED_BROWSER_RESULT,
  EMBEDDED_BROWSER_ACTION_NAMES,
  type BrowserPage,
  type EmbeddedBrowserAction,
  type EmbeddedBrowserSnapshot,
  type EmbeddedBrowserScope,
  type EmbeddedBrowserRequest,
  type EmbeddedBrowserResult,
} from '@smarteverything/domain';
import { openHubSocket, type HubSocket } from '../../../../api/connection/hub-socket';
import { routeFor } from '../../../../api/connection/active-route';
import type { ServerConnection } from '../../../../api/connection/storage';
import { SocketRecovery } from './socket-recovery';
import { embeddedBrowserSnapshot } from '../browser-embedded-snapshot';
import {
  browserPageSupported,
  isBrowserPageAction,
  isBrowserPageActionName,
  readBrowserPage,
} from '../browser-page-control';
import { jsonText } from '../../../../format/json-text';
import { BrowserTabError } from '../browser-tab-errors';
import type { BrowserTabs } from '../browser-tabs';
const log = new Logger('app.embedded-browser');
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
  private readonly recovery: SocketRecovery;
  private readonly stopRoute: () => void;
  constructor(
    private readonly connection: ServerConnection,
    private readonly owner: Omit<EmbeddedBrowserScope, 'generation'>,
    private readonly tabs: BrowserTabs,
    private readonly reveal: () => void,
  ) {
    this.recovery = new SocketRecovery({
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
    const response = parseResponse(data);
    if (response === null) return;
    switch (response.kind) {
      case 'accepted':
        this.accepted = JSON.stringify(response.scope) === JSON.stringify(this.scope);
        if (!this.accepted) this.drop(socket, 'browser.registration_changed_owner');
        return;
      case 'perform':
        this.perform(socket, response.request);
        return;
      case 'cancel':
        this.tasks.get(response.requestId)?.abort.abort();
        return;
      case 'refused':
        log.warn('browser.registration_refused', { reason: response.reason });
        this.drop(socket, 'browser.registration_refused');
        return;
    }
  }
  private drop(socket: HubSocket, event: string): void {
    log.warn(event, {});
    this.closed(socket);
    socket.close();
  }
  private perform(socket: HubSocket, request: EmbeddedBrowserRequest): void {
    const previous = this.tasks.get(request.requestId);
    if (previous !== undefined && JSON.stringify(previous.request) === JSON.stringify(request)) {
      this.answer(socket, previous);
      return;
    }
    if (!this.accepted || JSON.stringify(request.scope) !== JSON.stringify(this.scope)) {
      this.refuse(socket, request, 'Browser request changed registration.');
      return;
    }
    if (previous !== undefined) {
      this.refuse(socket, request, 'Browser request ID changed action.');
      return;
    }
    const abort = new AbortController();
    const task = { request, abort, result: this.run(request, abort.signal) };
    this.tasks.set(request.requestId, task);
    this.answer(socket, task);
  }
  private refuse(socket: HubSocket, request: EmbeddedBrowserRequest, reason: string): void {
    log.warn('browser.request_refused', { reason });
    this.send(socket, { kind: 'result', request, result: null, reason });
  }
  private async run(
    request: EmbeddedBrowserRequest,
    signal: AbortSignal,
  ): Promise<EmbeddedBrowserResult> {
    assertBrowserCommandActive(signal);
    const edited =
      request.operation.kind === 'edit'
        ? await this.edit(request.operation.action, signal)
        : { tabId: null, notice: undefined };
    assertBrowserCommandActive(signal);
    const page =
      request.operation.kind === 'read' && request.operation.view === 'page'
        ? await this.page(request.operation.tabId)
        : undefined;
    assertBrowserCommandActive(signal);
    const snapshot = {
      ...request.scope,
      ...embeddedBrowserSnapshot(this.tabs),
      capabilities: advertisedActions(),
      ...(page === undefined ? {} : { page }),
    };
    return EMBEDDED_BROWSER_RESULT.parse({
      snapshot,
      tabId: page?.tabId ?? edited.tabId,
      notice: edited.notice,
    });
  }
  private async page(tabId: string | undefined): Promise<BrowserPage> {
    const { selectedId } = this.tabs.read();
    const id = tabId ?? selectedId;
    if (id === null) throw new BrowserTabError('No tab is open.');
    this.reveal();
    const tab = this.tabs.tab(id);
    return readBrowserPage(tab, selectedId, this.tabs.mounted(tab.id));
  }
  private async edit(
    action: EmbeddedBrowserAction,
    signal: AbortSignal,
  ): Promise<{ readonly tabId: string | null; readonly notice?: string }> {
    const gone =
      action.kind === 'close' && !this.tabs.read().tabs.some((tab) => tab.id === action.tabId);
    if (showsPane(action)) this.reveal();
    const performed = this.tabs.perform(action, signal);
    const tabId =
      action.kind === 'reorder'
        ? null
        : action.kind === 'open'
          ? this.tabs.read().selectedId
          : action.tabId;
    await performed;
    return gone ? { tabId: null, notice: 'That tab was already closed.' } : { tabId };
  }
  private answer(socket: HubSocket, task: Task): void {
    background(
      task.result
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
          if (this.tasks.get(task.request.requestId) === task)
            this.tasks.delete(task.request.requestId);
        }),
      'embedded_browser_channel.background_failed',
    );
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
type BrowserResponse = z.infer<typeof EMBEDDED_BROWSER_RESPONSE>;
function parseResponse(data: unknown): BrowserResponse | null {
  if (typeof data !== 'string') {
    log.warn('browser.protocol_ignored', { reason: 'not text' });
    return null;
  }
  const json = jsonText(data);
  const parsed = json.ok ? EMBEDDED_BROWSER_RESPONSE.safeParse(json.value) : null;
  if (parsed?.success === true) return parsed.data;
  log.warn('browser.protocol_ignored', { reason: 'not a browser response' });
  return null;
}
function advertisedActions(): EmbeddedBrowserSnapshot['capabilities'] {
  const page = browserPageSupported();
  return EMBEDDED_BROWSER_ACTION_NAMES.filter((name) => page || !isBrowserPageActionName(name));
}
function showsPane(action: EmbeddedBrowserAction): boolean {
  return action.kind === 'open' || action.kind === 'select' || isBrowserPageAction(action);
}
function assertBrowserCommandActive(signal: AbortSignal): void {
  if (signal.aborted) throw new BrowserTabError('The browser command was cancelled.');
}
