import type { Logger } from '@smarteverything/logging';
import type { StoredEvent } from '../store/repositories/assistant-events';

export function eventFields(event: StoredEvent): Record<string, unknown> {
  return {
    eventId: event.id,
    kind: event.kind,
    chatId: event.chat_id,
    profileId: event.profile_id,
    textLength: event.text.length,
  };
}

export class DeliveryTrace {
  private readonly startedAt = performance.now();
  private readonly fields: Record<string, unknown>;

  constructor(
    private readonly log: Logger,
    event: StoredEvent,
  ) {
    this.fields = eventFields(event);
  }

  private elapsed(): number {
    return Math.round(performance.now() - this.startedAt);
  }

  waiting(attempt: number): void {
    this.log.debug('assistant.delivery_waiting', () => ({ ...this.fields, attempt }));
  }

  retired(attempt: number): void {
    this.log.info('assistant.delivery_retired', { ...this.fields, attempt });
  }

  discarded(): void {
    this.log.info('assistant.delivery_discarded', this.fields);
  }

  finished(attempt: number): void {
    this.log.info('assistant.delivery_finished', {
      ...this.fields,
      attempt,
      durationMs: this.elapsed(),
    });
  }

  failed(attempt: number, maxAttempts: number, cause: unknown, reason: string): void {
    this.log.warn('assistant.delivery_failed', {
      ...this.fields,
      attempt,
      maxAttempts,
      reason,
      cause: cause instanceof Error ? cause.name : typeof cause,
      durationMs: this.elapsed(),
    });
  }

  retryScheduled(attempt: number, backoffMs: number): void {
    this.log.debug('assistant.delivery_retry_scheduled', () => ({
      ...this.fields,
      attempt,
      backoffMs,
    }));
  }

  abandoned(attempts: number, reason: string | undefined): void {
    this.log.error('assistant.delivery_abandoned', undefined, { ...this.fields, attempts, reason });
  }
}
