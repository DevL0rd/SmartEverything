import type { RawData } from 'ws';
import type { Logger } from '@smarteverything/logging';

function rawLength(raw: RawData): number {
  if (Array.isArray(raw)) return raw.reduce((total, part) => total + part.length, 0);
  if (raw instanceof ArrayBuffer) return raw.byteLength;
  return raw.length;
}

export class NodeConnectionLog {
  attempts = 0;
  framesIn = 0;
  bytesIn = 0;
  private openedAt: number | null = null;

  constructor(
    private readonly log: Logger,
    private readonly path: string,
  ) {}

  get opened(): boolean {
    return this.openedAt !== null;
  }

  skipped(stopped: boolean, connected: boolean): void {
    this.log.trace('node.connect_skipped', { path: this.path, stopped, connected });
  }

  deferred(): void {
    this.log.debug('node.connect_deferred', { path: this.path, reason: 'transport_not_ready' });
  }

  connecting(url: URL, protocol: string, viaTransport: boolean, handshakeTimeoutMs: number): void {
    this.attempts += 1;
    this.framesIn = 0;
    this.bytesIn = 0;
    this.openedAt = null;
    this.log.info('node.connecting', {
      path: this.path,
      protocol,
      host: url.host,
      secure: url.protocol === 'wss:',
      viaTransport,
      attempt: this.attempts,
      handshakeTimeoutMs,
    });
  }

  welcomeTimedOut(timeoutMs: number): void {
    this.log.warn('node.welcome_timed_out', {
      path: this.path,
      timeoutMs,
      framesIn: this.framesIn,
    });
  }

  socketOpened(subprotocol: string): void {
    this.openedAt = performance.now();
    this.log.info('node.socket_opened', {
      path: this.path,
      attempt: this.attempts,
      protocol: subprotocol,
    });
  }

  frame(raw: RawData): void {
    this.framesIn += 1;
    this.bytesIn += rawLength(raw);
  }

  socketFailed(event: string, cause: Error, nextRetryMs: number): void {
    this.log.error(event, cause, {
      path: this.path,
      attempt: this.attempts,
      opened: this.opened,
      nextRetryMs,
    });
  }

  socketClosed(code: number, reasonLength: number, stopped: boolean): void {
    this.log.info('node.socket_closed', {
      path: this.path,
      closeCode: code,
      reasonLength,
      opened: this.opened,
      openMs: this.openedAt === null ? null : Math.round(performance.now() - this.openedAt),
      framesIn: this.framesIn,
      bytesIn: this.bytesIn,
      stopped,
    });
  }

  welcomed(): void {
    this.log.debug('node.welcomed', { path: this.path, framesIn: this.framesIn });
  }

  backoffReset(was: number): void {
    this.log.debug('node.backoff_reset', { path: this.path, was });
  }

  reconnecting(): void {
    this.log.info('node.reconnecting', { path: this.path, reason: 'requested' });
  }

  stopping(connected: boolean, retryPending: boolean): void {
    this.log.info('node.connection_stopping', { path: this.path, connected, retryPending });
  }

  routeChanged(connected: boolean): void {
    this.log.info('node.route_changed', { path: this.path, connected });
  }

  retryScheduled(delayMs: number): void {
    this.log.debug('node.retry_scheduled', { path: this.path, delayMs, attempt: this.attempts });
  }

  frameRejected(): void {
    this.log.error('node.frame_rejected', new Error('Frames are JSON text.'), {
      path: this.path,
    });
  }
}
