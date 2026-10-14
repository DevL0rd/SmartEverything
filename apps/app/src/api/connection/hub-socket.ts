import { randomUUID } from 'expo-crypto';
import { Logger } from '@smarteverything/logging';
import { connectionState } from './connection';
import { routeFor, type ActiveHubRoute, type HubRouteLease } from './active-route';
import { hubNetwork } from './route-platform';
import { StaleHubRouteError } from './route-policy';

const log = new Logger('app.hub-socket');
export interface HubSocketMessage {
  readonly data: unknown;
}
export interface HubSocketClose {
  readonly code: number;
  readonly reason: string;
}
export interface HubSocket {
  readonly readyState: number;
  send(data: string | ArrayBuffer | Uint8Array): void;
  close(code?: number, reason?: string): void;
  onopen: (() => void) | null;
  onmessage: ((event: HubSocketMessage) => void) | null;
  onclose: ((event: HubSocketClose) => void) | null;
  onerror: (() => void) | null;
}
export function openHubSocket(
  connection: { readonly url: string; readonly token: string },
  path: string,
  protocols: readonly string[],
): HubSocket {
  const current = connectionState.get();
  if (
    current.status !== 'paired' ||
    current.connection.token !== connection.token ||
    current.connection.url !== connection.url
  )
    throw new StaleHubRouteError('SOCKET');
  const manager = routeFor(current.connection);
  return new RoutedHubSocket(manager, path, protocols);
}
class RoutedHubSocket implements HubSocket {
  readyState: number = WebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((event: HubSocketMessage) => void) | null = null;
  onclose: ((event: HubSocketClose) => void) | null = null;
  onerror: (() => void) | null = null;
  private readonly id = randomUUID();
  private native: WebSocket | null = null;
  private stopEvents: (() => void) | null = null;
  private stopRoute: (() => void) | null = null;
  private lease: HubRouteLease | null = null;
  private pinnedOpening = false;
  constructor(manager: ActiveHubRoute, path: string, protocols: readonly string[]) {
    const scopeId = manager.scopeId;
    void manager
      .ready()
      .then(() => {
        if (this.readyState === WebSocket.CLOSED) return;
        if (scopeId !== manager.scopeId) {
          this.retire();
          return;
        }
        this.lease = manager.lease();
        const url = `${this.lease.baseUrl.replace(/^http/, 'ws')}${path}`;
        this.stopRoute = manager.state.subscribe(() => {
          if (this.lease?.isCurrent() === false) this.retire();
        });
        if (this.lease.endpoint.kind === 'lan' || this.lease.nativeAuthority === true)
          this.openPinned(url, protocols);
        else this.openPlatform(url, protocols);
      })
      .catch(() => {
        this.failed();
      });
  }
  send(data: string | ArrayBuffer | Uint8Array): void {
    if (this.lease?.isCurrent() !== true || this.readyState !== WebSocket.OPEN)
      throw new StaleHubRouteError('SOCKET');
    if (this.native !== null) {
      this.native.send(data);
      return;
    }
    const bytes =
      typeof data === 'string'
        ? data
        : [...(data instanceof Uint8Array ? data : new Uint8Array(data))];
    void hubNetwork()
      .sendSocket({ id: this.id, data: bytes })
      .catch(() => {
        this.failed();
      });
  }
  close(code = 1000, reason = 'socket stopped'): void {
    if (this.readyState === WebSocket.CLOSED) return;
    this.readyState = WebSocket.CLOSED;
    this.cleanup();
    if (this.native !== null) this.native.close(code, reason);
    else if (this.pinnedOpening)
      void hubNetwork()
        .closeSocket(this.id)
        .catch((error: unknown) => {
          log.warn('socket.close_failed', {
            failure: error instanceof Error ? error.name : 'NativeFailure',
          });
        });
  }
  retire(): void {
    this.close();
    this.onclose?.({ code: 1001, reason: 'Hub route changed' });
  }
  private openPlatform(url: string, protocols: readonly string[]): void {
    const socket = new WebSocket(url, [...protocols]);
    this.native = socket;
    socket.binaryType = 'arraybuffer';
    socket.onopen = (): void => {
      this.opened();
    };
    socket.onmessage = (event: { readonly data: unknown }): void => {
      this.received(event.data);
    };
    socket.onclose = (event): void => {
      this.closed(event.code, event.reason);
    };
    socket.onerror = (): void => {
      this.failed();
    };
  }
  private openPinned(url: string, protocols: readonly string[]): void {
    const lease = this.lease;
    if (lease === null) throw new StaleHubRouteError('SOCKET');
    const network = hubNetwork();
    this.stopEvents = network.subscribeSockets((event) => {
      if (event.id !== this.id) return;
      switch (event.kind) {
        case 'open':
          this.opened();
          return;
        case 'message':
          this.received(
            typeof event.data === 'string' ? event.data : new Uint8Array(event.data).buffer,
          );
          return;
        case 'close':
          this.closed(event.code, event.reason);
          return;
      }
    });
    this.pinnedOpening = true;
    void network
      .openSocket({
        scopeId: lease.scopeId,
        id: this.id,
        url,
        protocols: [...protocols],
        ...(lease.binding === undefined
          ? {}
          : {
              binding: lease.binding,
              routeGeneration: lease.nativeRouteGeneration ?? lease.generation,
            }),
      })
      .catch(() => {
        this.failed();
      });
  }
  private opened(): void {
    if (this.lease?.isCurrent() !== true || this.readyState === WebSocket.CLOSED) {
      this.close();
      return;
    }
    this.readyState = WebSocket.OPEN;
    this.onopen?.();
  }
  private received(data: unknown): void {
    if (this.lease?.isCurrent() === true && this.readyState === WebSocket.OPEN)
      this.onmessage?.({ data });
  }
  private closed(code: number, reason: string): void {
    if (this.readyState === WebSocket.CLOSED) return;
    this.readyState = WebSocket.CLOSED;
    this.cleanup();
    if (this.lease?.isCurrent() !== true) return;
    if (code !== 1000 && code !== 4001) this.lease.failed();
    this.onclose?.({ code, reason });
  }
  private failed(): void {
    if (this.readyState === WebSocket.CLOSED) return;
    if (this.lease !== null && !this.lease.isCurrent()) return;
    this.lease?.failed();
    this.onerror?.();
    this.close();
    this.onclose?.({ code: 1006, reason: 'Hub socket transport failed' });
  }
  private cleanup(): void {
    this.stopEvents?.();
    this.stopEvents = null;
    this.stopRoute?.();
    this.stopRoute = null;
  }
}
