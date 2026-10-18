import { randomUUID } from 'expo-crypto';
import { Logger } from '@smarteverything/logging';
import { errorFields } from '../../design/log-tally';
import { connectionState } from './connection';
import { routeFor, type ActiveHubRoute, type HubRouteLease } from './active-route';
import { hubNetwork, socketBridge, type SocketBridge } from './route-platform';
import { StaleHubRouteError } from './route-policy';
import { failureFacts, nowMs, safeText } from './request-log';
import { wireFrame } from '../../dev/wire-probe';
import {
  afterSocketAttempt,
  socketRouteFor,
  type SocketFallbackState,
  type SocketRoute,
} from './socket-fallback';

const log = new Logger('app.hub-socket');
const liveLog = new Logger('app.live');
let fallback: SocketFallbackState | null = null;
interface HubSocketMessage {
  readonly data: unknown;
}
interface HubSocketClose {
  readonly code: number;
  readonly reason: string;
}
export interface HubSocket {
  readonly readyState: number;
  sendable(): boolean;
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
function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : 'unknown failure';
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
  private bridge: SocketBridge | null = null;
  private route: SocketRoute | null = null;
  private readonly path: string;
  private readonly createdAt = nowMs();
  private openedAt: number | null = null;
  private framesIn = 0;
  private framesOut = 0;
  private transport = 'pending';
  private closeLogged = false;
  constructor(manager: ActiveHubRoute, path: string, protocols: readonly string[]) {
    this.path = path;
    const scopeId = manager.scopeId;
    log.debug('socket.opening', () => ({
      socket: this.tag(),
      path: this.shape(),
      scopeId: scopeId.slice(0, 8),
    }));
    void manager
      .ready()
      .then(() => {
        this.routeReady(manager, scopeId, protocols);
      })
      .catch((error: unknown) => {
        log.warn('socket.setup_failed', {
          socket: this.tag(),
          path: this.shape(),
          transport: this.transport,
          waitedMs: nowMs() - this.createdAt,
          ...failureFacts(error),
        });
        this.failed(describe(error));
      });
  }
  private routeReady(manager: ActiveHubRoute, scopeId: string, protocols: readonly string[]): void {
    log.debug('socket.route_ready', () => ({
      socket: this.tag(),
      path: this.shape(),
      waitedMs: nowMs() - this.createdAt,
      closedMeanwhile: this.readyState === WebSocket.CLOSED,
      scopeChanged: scopeId !== manager.scopeId,
    }));
    if (this.readyState === WebSocket.CLOSED) return;
    if (scopeId !== manager.scopeId) {
      this.retire();
      return;
    }
    const lease = this.chooseLease(manager);
    this.lease = lease;
    const url = `${lease.baseUrl.replace(/^http/, 'ws')}${this.path}`;
    this.stopRoute = manager.state.subscribe(() => {
      if (this.lease?.isCurrent() === false) this.retire();
    });
    const bridge = socketBridge(hubNetwork());
    const bridged =
      bridge !== undefined && (lease.endpoint.kind === 'lan' || lease.nativeAuthority === true);
    this.transport = bridged ? 'bridge' : 'platform';
    log.debug('socket.transport_chosen', () => ({
      socket: this.tag(),
      path: this.shape(),
      transport: this.transport,
      routeKind: lease.endpoint.kind,
      routeGeneration: lease.generation,
      nativeAuthority: lease.nativeAuthority === true,
      bridgeAvailable: bridge !== undefined,
      protocols: protocols.length,
    }));
    if (bridged) this.openBridged(bridge, url, protocols);
    else this.openPlatform(url, protocols);
  }
  private tag(): string {
    return this.id.slice(0, 8);
  }
  private shape(): string {
    return this.path.split('?')[0] ?? this.path;
  }
  private finish(by: string, code: number, reason: string): void {
    if (this.closeLogged) return;
    this.closeLogged = true;
    const facts = {
      socket: this.tag(),
      path: this.shape(),
      by,
      code,
      reason: safeText(reason),
      transport: this.transport,
      routeKind: this.lease?.endpoint.kind ?? null,
      routeGeneration: this.lease?.generation ?? null,
      everOpened: this.openedAt !== null,
      openMs: this.openedAt === null ? null : nowMs() - this.openedAt,
      lifeMs: nowMs() - this.createdAt,
      framesIn: this.framesIn,
      framesOut: this.framesOut,
    };
    if (by === 'local' || code === 1000 || code === 4001) log.info('socket.closed', facts);
    else log.warn('socket.closed', facts);
  }
  private chooseLease(manager: ActiveHubRoute): HubRouteLease {
    const primary = manager.lease();
    if (primary.endpoint.kind !== 'lan') return primary;
    let remote: HubRouteLease;
    try {
      remote = manager.lease(true);
    } catch (error) {
      log.debug('route.remote_lease_unavailable', () => ({
        scopeId: primary.scopeId,
        ...errorFields(error),
      }));
      return primary;
    }
    if (remote.endpoint.kind === 'lan') return primary;
    const chosen = socketRouteFor(
      fallback,
      `${primary.scopeId}|${primary.baseUrl}|${String(primary.nativeNetworkGeneration ?? '')}`,
    );
    fallback = chosen;
    this.route = chosen.route;
    log.debug('socket.route_chosen', () => ({
      socket: this.tag(),
      path: this.shape(),
      via: chosen.route,
      primaryKind: primary.endpoint.kind,
      fallbackKind: remote.endpoint.kind,
      consecutiveFailures: chosen.failures,
      routeGeneration: primary.generation,
    }));
    return chosen.route === 'fallback' ? remote : primary;
  }
  private attempted(opened: boolean, code?: number, reason?: string): void {
    const lease = this.lease;
    if (lease === null) return;
    liveLog.info('live.socket_attempt', {
      path: this.path,
      route: lease.endpoint.kind,
      host: new URL(lease.baseUrl).host,
      via: this.route ?? 'only',
      result: opened ? 'opened' : 'failed',
      ...(opened ? {} : { code, reason }),
    });
    if (this.route === null || fallback === null) return;
    const before = fallback.route;
    fallback = afterSocketAttempt(fallback, opened);
    if (fallback.route !== before)
      liveLog.warn('live.socket_route_switched', {
        path: this.path,
        from: before,
        to: fallback.route,
      });
  }
  sendable(): boolean {
    return this.readyState === WebSocket.OPEN && this.lease?.isCurrent() === true;
  }
  send(data: string | ArrayBuffer | Uint8Array): void {
    if (!this.sendable()) {
      log.debug('socket.send_refused', () => ({
        socket: this.tag(),
        path: this.shape(),
        readyState: this.readyState,
        routeCurrent: this.lease?.isCurrent() ?? null,
      }));
      throw new StaleHubRouteError('SOCKET');
    }
    this.framesOut += 1;
    wireFrame(this.path, 'out', data);
    if (this.native !== null) {
      this.native.send(data);
      return;
    }
    const bytes =
      typeof data === 'string'
        ? data
        : [...(data instanceof Uint8Array ? data : new Uint8Array(data))];
    void this.bridge?.sendSocket({ id: this.id, data: bytes }).catch((error: unknown) => {
      log.warn('socket.send_failed', {
        socket: this.tag(),
        path: this.shape(),
        bytes: bytes.length,
        framesOut: this.framesOut,
        ...failureFacts(error),
      });
      this.failed();
    });
  }
  close(code = 1000, reason = 'socket stopped'): void {
    if (this.readyState === WebSocket.CLOSED) return;
    this.finish('local', code, reason);
    this.readyState = WebSocket.CLOSED;
    this.cleanup();
    if (this.native !== null) this.native.close(code, reason);
    else if (this.bridge !== null)
      void this.bridge.closeSocket(this.id).catch((error: unknown) => {
        log.warn('socket.close_failed', { socket: this.tag(), ...failureFacts(error) });
      });
  }
  retire(): void {
    log.info('socket.retired', {
      socket: this.tag(),
      path: this.shape(),
      routeGeneration: this.lease?.generation ?? null,
      routeCurrent: this.lease?.isCurrent() ?? null,
      readyState: this.readyState,
    });
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
      log.debug('socket.error_event', () => ({
        socket: this.tag(),
        path: this.shape(),
        transport: 'platform',
        readyState: this.readyState,
        connectingMs: this.openedAt === null ? nowMs() - this.createdAt : null,
      }));
      this.onerror?.();
    };
  }
  private openBridged(bridge: SocketBridge, url: string, protocols: readonly string[]): void {
    const lease = this.lease;
    if (lease === null) throw new StaleHubRouteError('SOCKET');
    this.stopEvents = bridge.subscribeSockets((event) => {
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
    this.bridge = bridge;
    void bridge
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
      .catch((error: unknown) => {
        log.warn('socket.open_failed', {
          socket: this.tag(),
          path: this.shape(),
          transport: 'bridge',
          routeKind: lease.endpoint.kind,
          routeGeneration: lease.generation,
          connectingMs: nowMs() - this.createdAt,
          ...failureFacts(error),
        });
        this.failed(describe(error));
      });
  }
  private opened(): void {
    if (this.readyState === WebSocket.CLOSED) {
      this.close();
      return;
    }
    if (this.lease?.isCurrent() !== true) {
      this.retire();
      return;
    }
    this.readyState = WebSocket.OPEN;
    this.openedAt = nowMs();
    log.info('socket.opened', {
      socket: this.tag(),
      path: this.shape(),
      transport: this.transport,
      routeKind: this.lease.endpoint.kind,
      routeGeneration: this.lease.generation,
      via: this.route ?? 'only',
      connectMs: this.openedAt - this.createdAt,
    });
    this.attempted(true);
    this.onopen?.();
  }
  private received(data: unknown): void {
    this.framesIn += 1;
    wireFrame(this.path, 'in', data);
    if (this.readyState === WebSocket.OPEN) this.onmessage?.({ data });
  }
  private closed(code: number, reason: string): void {
    if (this.readyState === WebSocket.CLOSED) return;
    if (this.readyState === WebSocket.CONNECTING) this.attempted(false, code, reason);
    this.finish('remote', code, reason);
    this.readyState = WebSocket.CLOSED;
    this.cleanup();
    if (code !== 1000 && code !== 4001) {
      log.debug('socket.lease_marked_failed', () => ({ socket: this.tag(), code }));
      this.lease?.failed();
    }
    this.onclose?.({ code, reason });
  }
  private failed(detail?: string): void {
    if (this.readyState === WebSocket.CLOSED) return;
    if (this.readyState === WebSocket.CONNECTING) this.attempted(false, 1006, detail);
    this.finish('local_failure', 1006, detail ?? 'failed');
    this.lease?.failed();
    this.onerror?.();
    this.close();
    this.onclose?.({
      code: 1006,
      reason: `Lost the connection to your home${detail === undefined ? '' : ` (${detail})`}`,
    });
  }
  private cleanup(): void {
    this.stopEvents?.();
    this.stopEvents = null;
    this.stopRoute?.();
    this.stopRoute = null;
  }
}
