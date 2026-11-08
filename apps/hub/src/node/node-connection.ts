import type { RawData, WebSocket } from 'ws';
import { NODE_HEARTBEAT_MS } from '@smarteverything/domain';
import { background, type Logger } from '@smarteverything/logging';
import { NodeConnectionLog } from './node-connection-log';
import {
  openNodeHubSocket,
  retireNodeHubSocket,
  type NodeHubTransport,
} from '../client-network/node-transport';

const FIRST_RETRY_MS = 1000;
const LAST_RETRY_MS = 30_000;
const WELCOME_TIMEOUT_MS = 30_000;
const HANDSHAKE_TIMEOUT_MS = 10_000;
const MISSED_HEARTBEATS = 2.5;
const HUB_SILENCE_MS = NODE_HEARTBEAT_MS * MISSED_HEARTBEATS;

export interface NodeConnectionOptions {
  readonly hubUrl: string;
  readonly path: string;
  readonly protocol: string;
  readonly token: string;
  readonly transport?: NodeHubTransport | undefined;
  readonly log: Logger;
  readonly failure: string;
  readonly opened: (socket: WebSocket) => void;
  readonly message: (socket: WebSocket, text: string) => void;
  readonly closed: (socket: WebSocket) => void;
}

export class NodeConnection {
  private current: WebSocket | null = null;
  private unsubscribeRoute: (() => void) | null = null;
  private retry: NodeJS.Timeout | null = null;
  private welcome: NodeJS.Timeout | null = null;
  private silence: NodeJS.Timeout | null = null;
  private heardAt = 0;
  private stopped = false;
  private delay = FIRST_RETRY_MS;
  private readonly trace: NodeConnectionLog;

  constructor(private readonly options: NodeConnectionOptions) {
    this.trace = new NodeConnectionLog(options.log, options.path);
  }

  get socket(): WebSocket | null {
    return this.current;
  }

  start(): void {
    if (this.stopped || this.current !== null) {
      this.trace.skipped(this.stopped, this.current !== null);
      return;
    }
    this.followRoute();
    if (this.options.transport?.ready() === false) {
      this.trace.deferred();
      this.scheduleRetry();
      return;
    }
    if (this.retry !== null) clearTimeout(this.retry);
    this.retry = null;
    const url = new URL(this.options.path, this.options.hubUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = openNodeHubSocket(this.options.transport, url, [this.options.protocol], {
      headers: { authorization: `Bearer ${this.options.token}` },
      handshakeTimeout: HANDSHAKE_TIMEOUT_MS,
    });
    this.current = socket;
    this.trace.connecting(
      url,
      this.options.protocol,
      this.options.transport !== undefined,
      HANDSHAKE_TIMEOUT_MS,
    );
    this.welcome = setTimeout(() => {
      this.trace.welcomeTimedOut(WELCOME_TIMEOUT_MS);
      socket.terminate();
    }, WELCOME_TIMEOUT_MS);
    this.wire(socket);
  }

  private wire(socket: WebSocket): void {
    socket.on('open', () => {
      if (this.current !== socket) return;
      this.trace.socketOpened(socket.protocol);
      this.listenForHub(socket);
      this.options.opened(socket);
    });
    socket.on('ping', () => {
      if (this.current === socket) this.listenForHub(socket);
    });
    socket.on('message', (raw, binary) => {
      if (this.current !== socket) return;
      this.listenForHub(socket);
      this.trace.frame(raw);
      if (binary) this.trace.frameRejected();
      else this.options.message(socket, textOf(raw));
    });
    socket.on('error', (cause) => {
      this.trace.socketFailed(this.options.failure, cause, this.delay);
    });
    socket.on('close', (code, reason) => {
      this.trace.socketClosed(code, reason.length, this.stopped);
      this.closed(socket);
    });
  }

  welcomed(): void {
    if (this.welcome !== null) this.trace.welcomed();
    if (this.welcome !== null) clearTimeout(this.welcome);
    this.welcome = null;
  }

  healthy(): void {
    if (this.delay !== FIRST_RETRY_MS) this.trace.backoffReset(this.delay);
    this.delay = FIRST_RETRY_MS;
  }

  reconnect(): void {
    const socket = this.current;
    if (socket === null) return;
    this.trace.reconnecting();
    this.closed(socket);
    retireNodeHubSocket(socket);
  }

  stop(): void {
    this.trace.stopping(this.current !== null, this.retry !== null);
    this.stopped = true;
    this.unsubscribeRoute?.();
    this.unsubscribeRoute = null;
    this.welcomed();
    this.stopListeningForHub();
    if (this.retry !== null) clearTimeout(this.retry);
    this.retry = null;
    const socket = this.current;
    this.current = null;
    if (socket !== null) retireNodeHubSocket(socket);
  }

  private followRoute(): void {
    if (this.unsubscribeRoute !== null || this.options.transport === undefined) return;
    this.unsubscribeRoute = this.options.transport.subscribe(() => {
      this.trace.routeChanged(this.current !== null);
      if (this.retry !== null) clearTimeout(this.retry);
      this.retry = null;
      if (this.current === null) this.start();
      else this.reconnect();
    });
  }

  private listenForHub(socket: WebSocket): void {
    this.heardAt = performance.now();
    if (this.silence === null) this.waitForHub(socket, HUB_SILENCE_MS);
  }

  private waitForHub(socket: WebSocket, waitMs: number): void {
    this.silence = setTimeout(() => {
      this.silence = null;
      const quietMs = performance.now() - this.heardAt;
      if (quietMs < HUB_SILENCE_MS) {
        this.waitForHub(socket, HUB_SILENCE_MS - quietMs);
        return;
      }
      this.trace.hubSilent(Math.round(quietMs));
      socket.terminate();
    }, waitMs);
  }

  private stopListeningForHub(): void {
    if (this.silence !== null) clearTimeout(this.silence);
    this.silence = null;
  }

  private closed(socket: WebSocket): void {
    if (this.current !== socket) return;
    this.current = null;
    this.stopListeningForHub();
    this.welcomed();
    this.options.closed(socket);
    this.scheduleRetry();
  }

  private scheduleRetry(): void {
    if (this.stopped || this.retry !== null) return;
    this.trace.retryScheduled(this.delay);
    this.retry = setTimeout(() => {
      this.retry = null;
      background(this.retryConnection(), 'node.connection_retry_failed', {
        path: this.options.path,
      });
    }, this.delay);
    this.delay = Math.min(this.delay * 2, LAST_RETRY_MS);
  }

  private async retryConnection(): Promise<void> {
    try {
      if (this.options.transport?.ready() === false) await this.options.transport.refresh();
      this.start();
    } catch (cause) {
      this.options.log.error('node.route_refresh_failed', cause, { path: this.options.path });
      this.scheduleRetry();
    }
  }
}

function textOf(raw: RawData): string {
  if (Array.isArray(raw)) return Buffer.concat(raw).toString('utf8');
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString('utf8');
  return raw.toString('utf8');
}
