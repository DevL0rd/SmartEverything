import { Logger, messageOf } from '@smarteverything/logging';
import { failureOf } from './warm-failure';

const log = new Logger('hub.voice-warm');

export interface WireFacts {
  readonly wire: boolean;
  readonly sinceConnectMs: number | null;
}

export class WarmLog {
  private leasedAt = 0;
  private lastCallId: string | null = null;

  constructor(
    private readonly key: string,
    private readonly now: () => number,
  ) {}

  leased(callId: string, connecting: boolean, wire: boolean, idleSince: number): void {
    this.leasedAt = this.now();
    log.debug('voice.warm_leased', () => ({
      key: this.key,
      callId,
      wire,
      connecting,
      sinceReleaseMs: idleSince === 0 ? null : this.leasedAt - idleSince,
    }));
  }

  released(callId: string, normalize: boolean, wire: boolean): void {
    this.lastCallId = callId;
    log.info('voice.warm_released', {
      key: this.key,
      callId,
      normalize,
      heldMs: this.now() - this.leasedAt,
      wire,
    });
  }

  stopped(reason: string, leased: boolean, createdAt: number): void {
    log.info('voice.warm_stopped', {
      key: this.key,
      reason,
      leased,
      ageMs: createdAt === 0 ? 0 : this.now() - createdAt,
    });
  }

  idleOutput(kind: string, idleSince: number, facts: WireFacts, tool?: string): void {
    log.warn('voice.warm_idle_output', {
      key: this.key,
      kind,
      ...(tool === undefined ? {} : { tool }),
      lastCallId: this.lastCallId,
      sinceReleaseMs: idleSince === 0 ? null : this.now() - idleSince,
      sinceConnectMs: facts.sinceConnectMs,
    });
  }

  handleRejected(cause: unknown): void {
    log.warn('voice.warm_handle_rejected', {
      key: this.key,
      cause: messageOf(cause),
      ...failureOf(cause),
    });
  }

  reconnectScheduled(attempt: number, delayMs: number): void {
    log.debug('voice.warm_reconnect_scheduled', { key: this.key, attempt, delayMs });
  }

  reconnectFailed(cause: unknown, attempt: number, nextMs: number): void {
    log.warn('voice.warm_reconnect_failed', {
      key: this.key,
      attempt,
      nextMs,
      cause: messageOf(cause),
      ...failureOf(cause),
    });
  }

  sendDropped(callId: string, what: string, tenantCurrent: boolean, wireCurrent: boolean): void {
    log.warn('voice.warm_send_dropped', {
      key: this.key,
      callId,
      what,
      tenantCurrent,
      wireCurrent,
    });
  }

  dropped(facts: {
    readonly code: number;
    readonly reason: string;
    readonly goAway: boolean;
    readonly sinceConnectMs: number;
  }): void {
    const { code, ...rest } = facts;
    log.info('voice.warm_dropped', { key: this.key, closeCode: code, ...rest });
  }

  reconnected(resumed: boolean, durationMs: number, attempt: number): void {
    log.info('voice.warm_reconnected', { key: this.key, resumed, durationMs, attempt });
  }

  created(durationMs: number): void {
    log.info('voice.warm_created', { key: this.key, durationMs });
  }
}
