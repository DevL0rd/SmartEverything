import { Logger } from '@smarteverything/logging';
import type { StoredEvent } from '../../../store/repositories/assistant-events';

const log = new Logger('hub.assistant-engine');

export class DshTrace {
  private readonly startedAt = performance.now();
  private readonly fields: Record<string, unknown>;

  constructor(event: StoredEvent, chatId: string) {
    this.fields = { eventId: event.id, chatId, profileId: event.profile_id };
  }

  private elapsed(): number {
    return Math.round(performance.now() - this.startedAt);
  }

  replayed(state: string): void {
    log.warn('dsh.delivery_replayed', { ...this.fields, state });
  }

  sessionReady(session: string): void {
    log.debug('dsh.session_ready', () => ({
      ...this.fields,
      harnessSession: session,
      durationMs: this.elapsed(),
    }));
  }

  turnStarted(session: string, model: string, replyId: string): void {
    log.info('dsh.turn_started', { ...this.fields, harnessSession: session, model, replyId });
  }

  promptSent(): void {
    log.debug('dsh.prompt_sent', () => ({ ...this.fields, durationMs: this.elapsed() }));
  }

  promptFailed(cause: unknown, session: string): void {
    log.error('dsh.prompt_failed', cause, {
      ...this.fields,
      harnessSession: session,
      durationMs: this.elapsed(),
    });
  }

  turnFinished(session: string): void {
    log.info('dsh.turn_finished', {
      ...this.fields,
      harnessSession: session,
      durationMs: this.elapsed(),
    });
  }
}

export function steerSkipped(
  event: StoredEvent,
  chatId: string,
  why: Record<string, unknown>,
): void {
  log.debug('dsh.steer_skipped', () => ({ eventId: event.id, chatId, ...why }));
}

export function steered(event: StoredEvent, chatId: string, session: string, epoch: number): void {
  log.info('dsh.steered', {
    eventId: event.id,
    chatId,
    harnessSession: session,
    epoch,
    textLength: event.text.length,
  });
}

export function controlRefused(chatId: string, kind: string): void {
  log.warn('dsh.control_refused', { chatId, kind, reason: 'no_epoch' });
}

export function controlSent(chatId: string, kind: string, session: string, epoch: number): void {
  log.debug('dsh.control_sent', { chatId, kind, harnessSession: session, epoch });
}

export function controlFinished(chatId: string, kind: string, startedAt: number): void {
  log.info('dsh.control_finished', {
    chatId,
    kind,
    durationMs: Math.round(performance.now() - startedAt),
  });
}

export function controlFailed(
  chatId: string,
  kind: string,
  cause: unknown,
  startedAt: number,
): void {
  log.error('dsh.control_failed', cause, {
    chatId,
    kind,
    durationMs: Math.round(performance.now() - startedAt),
  });
}
