import type { CodexProviderEvent, CodexProviderTurn } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { messageOf } from '@smarteverything/logging';

const TERMINAL_STATES: ReadonlySet<string> = new Set([
  'completed',
  'failed',
  'interrupted',
  'unknown',
]);

function failure(cause: unknown): Record<string, unknown> {
  return {
    errorName: cause instanceof Error ? cause.name : typeof cause,
    reason: messageOf(cause).slice(0, 300),
  };
}

export class ProviderLog {
  private readonly tallies = new Map<string, Map<string, number>>();

  constructor(private readonly log: Logger) {}

  configured(enabled: boolean, wasEnabled: boolean, jobs: number, connected: boolean): void {
    this.log.info('codex.provider_configured', { enabled, wasEnabled, jobs, connected });
  }

  stopping(jobs: number, connected: boolean, epoch: number): void {
    this.log.info('codex.provider_stopping', { jobs, connected, epoch });
  }

  initializing(epoch: number): void {
    this.log.debug('codex.initializing', { mode: 'provider', epoch });
  }

  initializeFailed(cause: unknown): void {
    this.log.warn('codex.initialize_failed', { mode: 'provider', ...failure(cause) });
  }

  models(count: number, billingBlocked: boolean, startedAt: number): void {
    this.log.debug('codex.models_read', () => ({
      models: count,
      billingBlocked,
      durationMs: Math.round(performance.now() - startedAt),
    }));
  }

  received(turn: CodexProviderTurn, jobs: number): void {
    this.log.debug('codex.submission_received', {
      jobId: turn.job_id,
      chatId: turn.chat_id,
      deviceId: turn.device_id,
      model: turn.model,
      effort: turn.effort,
      resume: turn.session_id !== null,
      tools: turn.tools.length,
      jobs,
    });
  }

  admitted(turn: CodexProviderTurn, sessionId: string, startedAt: number): void {
    this.log.info('codex.submission_admitted', {
      jobId: turn.job_id,
      chatId: turn.chat_id,
      sessionId,
      durationMs: Math.round(performance.now() - startedAt),
    });
  }

  failed(turn: CodexProviderTurn, cause: unknown, startedAt: number): void {
    this.log.warn('codex.submission_failed', {
      jobId: turn.job_id,
      chatId: turn.chat_id,
      durationMs: Math.round(performance.now() - startedAt),
      ...failure(cause),
    });
  }

  threadReady(turn: CodexProviderTurn, threadId: string): void {
    this.log.debug('codex.thread_ready', {
      jobId: turn.job_id,
      chatId: turn.chat_id,
      threadId,
      resumed: turn.session_id !== null,
    });
  }

  inputsDiscarded(jobId: string): void {
    this.log.debug('codex.inputs_discarded', { jobId });
  }

  turnStarted(turn: CodexProviderTurn, threadId: string, turnId: string): void {
    this.log.info('codex.turn_started', {
      jobId: turn.job_id,
      chatId: turn.chat_id,
      threadId,
      turnId,
      model: turn.model,
    });
  }

  turnUnconfirmed(turn: CodexProviderTurn, threadId: string, cause: unknown): void {
    this.log.error('codex.turn_unconfirmed', cause, {
      jobId: turn.job_id,
      chatId: turn.chat_id,
      threadId,
    });
  }

  interrupting(turn: CodexProviderTurn, threadId: string, turnId: string): void {
    this.log.info('codex.interrupting', {
      jobId: turn.job_id,
      chatId: turn.chat_id,
      threadId,
      turnId,
    });
  }

  event(event: CodexProviderEvent): void {
    const kinds = this.tallies.get(event.job_id) ?? new Map<string, number>();
    kinds.set(event.kind, (kinds.get(event.kind) ?? 0) + 1);
    this.tallies.set(event.job_id, kinds);
    if (event.kind === 'lifecycle' || event.kind === 'accepted') {
      this.log.debug('codex.event_published', {
        jobId: event.job_id,
        kind: event.kind,
        state: event.kind === 'lifecycle' ? event.state : undefined,
        seq: event.seq,
      });
    }
    if (event.kind === 'lifecycle' && TERMINAL_STATES.has(event.state)) {
      this.log.info('codex.job_settled', {
        jobId: event.job_id,
        state: event.state,
        events: Object.fromEntries(kinds),
      });
      this.tallies.delete(event.job_id);
    }
  }
}
