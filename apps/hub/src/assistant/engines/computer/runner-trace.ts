import type { Logger } from '@smarteverything/logging';
import type { AiChatRow } from '@smarteverything/domain';
import type { StoredEvent } from '../../../store/repositories/assistant-events';
import type { Turn } from './ports';
import { messageOf } from '@smarteverything/logging';

export class ComputerTrace {
  private readonly startedAt = new Map<string, number>();

  constructor(
    private readonly log: Logger,
    private readonly runtime: string,
  ) {}

  private elapsed(chatId: string): number | undefined {
    const started = this.startedAt.get(chatId);
    return started === undefined ? undefined : Math.round(performance.now() - started);
  }

  private ids(turn: Turn): Record<string, unknown> {
    return {
      runtime: this.runtime,
      chatId: turn.chat.id,
      eventId: turn.event.id,
      jobId: turn.jobId,
    };
  }

  notReady(chat: AiChatRow, event: StoredEvent, reason: string): void {
    this.log.warn('computer.turn_not_ready', {
      runtime: this.runtime,
      chatId: chat.id,
      eventId: event.id,
      reason,
    });
  }

  started(turn: Turn, activeTurns: number): void {
    this.startedAt.set(turn.chat.id, performance.now());
    this.log.info('computer.turn_started', { ...this.ids(turn), activeTurns });
  }

  errored(chat: AiChatRow, event: StoredEvent, turn: Turn | null, cause: unknown): void {
    this.log.warn('computer.turn_errored', {
      runtime: this.runtime,
      chatId: chat.id,
      eventId: event.id,
      jobId: turn?.jobId,
      cause: cause instanceof Error ? cause.name : typeof cause,
      reason: messageOf(cause).slice(0, 300),
      opened: turn !== null,
    });
  }

  submitted(turn: Turn, session: string | null, stillCurrent: boolean): void {
    this.log.debug('computer.turn_submitted', () => ({
      ...this.ids(turn),
      harnessSession: session,
      stillCurrent,
    }));
  }

  toolRequested(turn: Turn, tool: string, callId: string): void {
    this.log.debug('computer.tool_requested', () => ({ ...this.ids(turn), tool, callId }));
  }

  waiting(turn: Turn, kind: string): void {
    this.log.info('computer.turn_waiting', { ...this.ids(turn), kind });
  }

  finished(turn: Turn, replyLength: number): void {
    this.log.info('computer.turn_finished', {
      ...this.ids(turn),
      replyLength,
      durationMs: this.elapsed(turn.chat.id),
    });
  }

  failed(turn: Turn, outcome: { lifecycle: string; code: string; reason: string }): void {
    this.log.warn('computer.turn_failed', {
      ...this.ids(turn),
      lifecycle: outcome.lifecycle,
      reasonCode: outcome.code,
      reason: outcome.reason.slice(0, 300),
      durationMs: this.elapsed(turn.chat.id),
    });
  }

  closed(chatId: string): void {
    this.startedAt.delete(chatId);
  }
}
