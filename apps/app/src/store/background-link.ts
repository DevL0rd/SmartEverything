import type { LiveNotificationNotice, PushCommandNotice } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { errorFields } from '../design/log-tally';
import {
  TOKEN_WITHDRAWN,
  backoffOf,
  type Received,
  type SocketHandlers,
  type SocketTarget,
} from './live-socket';

const log = new Logger('app.background-link');

export interface BackgroundLinkPorts {
  readonly open: (target: SocketTarget, handlers: SocketHandlers) => () => void;
  readonly notification: (notice: LiveNotificationNotice) => void;
  readonly pushCommand: (notice: PushCommandNotice) => void;
  readonly refused: () => void;
}

export class BackgroundLink {
  private stopSocket: (() => void) | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private run = 0;
  private running = false;

  constructor(
    private readonly connection: { readonly url: string; readonly token: string },
    private readonly ports: BackgroundLinkPorts,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.attempt = 0;
    log.info('background.starting');
    this.open();
  }

  stop(): void {
    if (!this.running) return;
    log.info('background.stopping');
    this.running = false;
    this.run += 1;
    this.clearRetry();
    this.stopSocket?.();
    this.stopSocket = null;
  }

  online(): void {
    if (!this.running || this.retry === null) return;
    log.info('background.online_hint', { attempt: this.attempt });
    this.clearRetry();
    this.open();
  }

  private open(): void {
    this.run += 1;
    const run = this.run;
    try {
      this.stopSocket = this.ports.open(
        {
          url: this.connection.url,
          token: this.connection.token,
          subscribe: { type: 'subscribe', tables: [], streams: [], background: true },
        },
        {
          onOpen: (): void => {
            if (run === this.run) this.attempt = 0;
          },
          onMessage: (received): void => {
            if (run === this.run) this.receive(received);
          },
          onClose: (code, reason): void => {
            if (run === this.run) this.closed(code, reason);
          },
        },
      );
    } catch (error) {
      log.warn('background.open_failed', errorFields(error));
      this.scheduleRetry();
    }
  }

  private receive(received: Received): void {
    if (received.kind === 'unreadable') {
      log.warn('background.unreadable', { reason: received.reason });
      return;
    }
    const { message } = received;
    if (message.type === 'notification') this.ports.notification(message);
    else if (message.type === 'push_command') this.ports.pushCommand(message);
  }

  private closed(code: number, reason: string): void {
    this.stopSocket = null;
    log.info('background.closed', { code, reason });
    if (code === TOKEN_WITHDRAWN) {
      this.running = false;
      this.ports.refused();
      return;
    }
    this.scheduleRetry();
  }

  private scheduleRetry(): void {
    const wait = backoffOf(this.attempt);
    this.attempt += 1;
    log.info('background.retry_scheduled', { inMs: wait });
    this.retry = setTimeout(() => {
      this.retry = null;
      this.open();
    }, wait);
  }

  private clearRetry(): void {
    if (this.retry !== null) clearTimeout(this.retry);
    this.retry = null;
  }
}
