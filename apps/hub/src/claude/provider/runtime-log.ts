import type { ClaudeProviderOptions, ProviderTurn } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { messageOf } from '@smarteverything/logging';

function failure(cause: unknown): Record<string, unknown> {
  return {
    errorName: cause instanceof Error ? cause.name : typeof cause,
    reason: messageOf(cause).slice(0, 300),
  };
}

export class RuntimeLog {
  constructor(
    private readonly log: Logger,
    private readonly deviceId: string,
  ) {}

  configured(
    enabled: boolean,
    wasEnabled: boolean,
    jobs: number,
    options: ClaudeProviderOptions,
  ): void {
    this.log.info('claude.runtime_configured', {
      deviceId: this.deviceId,
      enabled,
      wasEnabled,
      jobs,
      builtinTools: options.builtin_tools.length,
    });
  }

  received(turn: ProviderTurn, jobs: number): void {
    this.log.debug('claude.submission_received', {
      jobId: turn.job_id,
      chatId: turn.chat_id,
      deviceId: this.deviceId,
      profileId: turn.profile_id,
      model: turn.model,
      resumeSession: turn.session_id !== null,
      jobs,
    });
  }

  refused(turn: ProviderTurn, reason: string, extra: Record<string, unknown> = {}): void {
    this.log.warn('claude.submission_refused', {
      jobId: turn.job_id,
      chatId: turn.chat_id,
      reason,
      ...extra,
    });
  }

  admitted(turn: ProviderTurn, sessionId: string | null, startedAt: number): void {
    this.log.info('claude.submission_admitted', {
      jobId: turn.job_id,
      chatId: turn.chat_id,
      sessionId,
      durationMs: Math.round(performance.now() - startedAt),
    });
  }

  failed(turn: ProviderTurn, cause: unknown, startedAt: number): void {
    this.log.warn('claude.submission_failed', {
      jobId: turn.job_id,
      chatId: turn.chat_id,
      durationMs: Math.round(performance.now() - startedAt),
      ...failure(cause),
    });
  }

  admission(turn: ProviderTurn, cwd: string, continuing: boolean, receiptKnown: boolean): void {
    this.log.debug('claude.admission_checked', {
      jobId: turn.job_id,
      chatId: turn.chat_id,
      cwdLength: cwd.length,
      continuing,
      receiptKnown,
    });
  }

  jobRegistered(jobId: string, jobs: number): void {
    this.log.debug('claude.job_registered', { jobId, jobs });
  }

  jobLimit(jobId: string, jobs: number): void {
    this.log.warn('claude.job_limit_reached', { jobId, jobs });
  }

  read(jobId: string, chatId: string, kind: string): void {
    this.log.debug('claude.read_requested', { jobId, chatId, kind });
  }

  controlStarted(jobId: string, chatId: string, action: string): void {
    this.log.info('claude.control_started', { jobId, chatId, action });
  }

  controlApplied(jobId: string, action: string, startedAt: number): void {
    this.log.info('claude.control_applied', {
      jobId,
      action,
      durationMs: Math.round(performance.now() - startedAt),
    });
  }

  controlFailed(jobId: string, action: string, cause: unknown, startedAt: number): void {
    this.log.warn('claude.control_failed', {
      jobId,
      action,
      durationMs: Math.round(performance.now() - startedAt),
      ...failure(cause),
    });
  }

  adopted(chatId: string, sourceSessionId: string, sessionId: string): void {
    this.log.info('claude.session_adopted', { chatId, sourceSessionId, sessionId });
  }

  stopping(jobs: number): void {
    this.log.info('claude.runtime_stopping', { deviceId: this.deviceId, jobs });
  }

  rememberFailed(cause: unknown, jobId: string, chatId: string): void {
    this.log.error('claude.session_remember_failed', cause, { jobId, chatId });
  }

  jobMissing(jobId: string, jobs: number): void {
    this.log.debug('claude.job_missing', { jobId, jobs });
  }

  unavailable(enabled: boolean, stopped: boolean): void {
    this.log.debug('claude.runtime_unavailable', { enabled, stopped });
  }

  probeStarting(): void {
    this.log.debug('claude.probe_starting', { deviceId: this.deviceId });
  }

  probeFailed(cause: unknown): void {
    this.log.warn('claude.probe_failed', failure(cause));
  }

  jobsClosing(jobs: number): void {
    this.log.debug('claude.jobs_closing', { jobs });
  }
}
