import { randomUUID } from 'node:crypto';
import { Logger, background, describeFailure } from '@smarteverything/logging';
import type { AiChatRow } from '@smarteverything/domain';
import type { StoredEvent } from '../../../store/repositories/assistant-events';
import type { TurnStream } from '../../conversation/stream';
import { CONTINUE_NOTE } from '../../interruption';
import { isModelUnavailable } from '../../../harness/model-unavailable';

export const RETRY_WAIT_MS = 2000;

const log = new Logger('hub.harness');

export interface RetryableTurn {
  readonly event: StoredEvent;
  readonly chat: AiChatRow;
  readonly stream: TurnStream;
}

export interface TurnFailure {
  readonly code: string;
  readonly message: string;
}

const FINAL_FAILURES: ReadonlySet<string> = new Set([
  'quota_exhausted',
  'route_unavailable',
  'subscription_unavailable',
  'capability_unsupported',
  'composition_incompatible',
]);

export function finalFailure(failure: TurnFailure): boolean {
  return FINAL_FAILURES.has(failure.code);
}

export interface TurnRetryPorts<T extends RetryableTurn> {
  readonly resume: (turn: T, deliveryId: string, text: string) => Promise<void>;
  readonly active: (turn: T) => boolean;
  readonly final: (turn: T, message: string) => void;
}

export class TurnRetries<T extends RetryableTurn> {
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly notes = new Map<string, string>();
  private readonly attempts = new Map<string, number>();

  constructor(private readonly ports: TurnRetryPorts<T>) {}

  waiting(turn: T): boolean {
    return this.timers.has(turn.event.id);
  }

  failed(turn: T, failure: TurnFailure): void {
    if (this.timers.has(turn.event.id)) {
      log.debug('turn.retry_already_waiting', {
        eventId: turn.event.id,
        chatId: turn.chat.id,
        failureCode: failure.code,
      });
      return;
    }
    const attempt = (this.attempts.get(turn.event.id) ?? 0) + 1;
    this.attempts.set(turn.event.id, attempt);
    log.warn('turn.retry_scheduled', {
      eventId: turn.event.id,
      chatId: turn.chat.id,
      attempt,
      failureCode: failure.code,
      reason: failure.message,
      waitMs: RETRY_WAIT_MS,
    });
    turn.stream.retrying();
    this.schedule(turn);
  }

  cancel(turn: T): boolean {
    const id = turn.event.id;
    const timer = this.timers.get(id);
    this.forget(turn);
    if (timer === undefined) return false;
    log.info('turn.retry_cancelled', { eventId: id, chatId: turn.chat.id });
    return true;
  }

  forget(turn: T): void {
    const id = turn.event.id;
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    this.notes.delete(id);
    this.attempts.delete(id);
  }

  private schedule(turn: T): void {
    this.timers.set(
      turn.event.id,
      setTimeout(() => {
        this.timers.delete(turn.event.id);
        background(this.resume(turn), 'turn.retry_failed');
      }, RETRY_WAIT_MS),
    );
  }

  private async resume(turn: T): Promise<void> {
    if (!this.ports.active(turn)) return;
    const id = turn.event.id;
    const note = this.notes.get(id) ?? randomUUID();
    this.notes.set(id, note);
    try {
      await this.ports.resume(turn, note, CONTINUE_NOTE);
      log.info('turn.retry_sent', { eventId: id, chatId: turn.chat.id, noteId: note });
    } catch (cause) {
      if (!this.ports.active(turn)) return;
      const { name, message } = describeFailure(cause);
      if (isModelUnavailable(cause)) {
        this.ports.final(turn, message);
        return;
      }
      log.error('turn.retry_send_failed', cause, { eventId: id, chatId: turn.chat.id });
      this.failed(turn, { code: name, message });
    }
  }
}
