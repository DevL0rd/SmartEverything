import { Logger, messageOf } from '@smarteverything/logging';
import type { IdleDecision } from './idle-clock';
import type { RenewalAnswer, RenewReason } from './live-renewal';

const log = new Logger('hub.voice-conversation');

export interface RenewingFields {
  readonly reason: RenewReason;
  readonly resumed: boolean;
  readonly handle: boolean;
  readonly current: boolean;
  readonly owed: boolean;
  readonly toolsRunning: number;
  readonly talking: boolean;
  readonly closeCode?: number;
  readonly closeReason?: string;
}

export interface RenewedFields {
  readonly reason: RenewReason;
  readonly resumed: boolean;
  readonly durationMs: number;
  readonly catchUpLines: number;
  readonly catchUpPictures: number;
  readonly respond: boolean;
}

export class ConversationTrace {
  constructor(private readonly callId: () => string | undefined) {}

  private fields(): Record<string, unknown> {
    return { callId: this.callId() };
  }

  starting(hasFirst: boolean): void {
    log.info('conversation.starting', { ...this.fields(), hasFirst });
  }

  renewing(fields: RenewingFields): void {
    log.info('conversation.renewing', {
      ...this.fields(),
      ...fields,
      ...(fields.closeReason === undefined
        ? {}
        : { closeReason: fields.closeReason.slice(0, 200) }),
    });
  }

  renewFailed(cause: unknown, resumed: boolean): void {
    log.warn('conversation.renew_failed', {
      ...this.fields(),
      resumed,
      cause: cause instanceof Error ? cause.name : typeof cause,
      reason: messageOf(cause).slice(0, 200),
    });
  }

  renewed(fields: RenewedFields): void {
    log.info('conversation.renewed', { ...this.fields(), ...fields });
  }

  answered(answer: RenewalAnswer): void {
    log.info('conversation.renew_answered', { ...this.fields(), ...answer });
  }

  idleEnded(decision: IdleDecision, speech: string): void {
    log.info('conversation.idle_ended', { ...this.fields(), ...decision, speech });
  }

  silent(resumed: boolean): void {
    log.warn('conversation.renew_silent', { ...this.fields(), resumed });
  }
}
