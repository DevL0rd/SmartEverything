import type { CallEnding } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Call } from './call-parts';

const BY_REASON: Readonly<Record<CallEnding, string>> = {
  hung_up: 'client_hang_up',
  idle: 'idle_clock',
  finished: 'assistant_finished',
  failed: 'unknown_failure',
  disconnected: 'connection_lost',
  replaced: 'replaced_by_new_call',
};

const BY_CAUSE: Readonly<Record<string, string>> = {
  client_hang_up: 'person',
  idle_clock: 'idle_clock',
  assistant_finished: 'assistant',
  connection_lost: 'connection',
  hub_stopping: 'hub',
  replaced_by_new_call: 'hub',
  speech_input_failed: 'microphone',
  no_reply: 'reply_watchdog',
  renew_unplannable: 'provider',
  renew_failed: 'provider',
  start_failed: 'provider',
};

export function endCauseOf(reason: CallEnding): string {
  return BY_REASON[reason];
}

export function endedByOf(cause: string): string {
  return BY_CAUSE[cause] ?? 'unknown';
}

export interface CallEndFacts {
  readonly reason: CallEnding;
  readonly detail: string | null;
  readonly cause: string | undefined;
}

export function logCallEnd(log: Logger, call: Call, end: CallEndFacts, now: Date): void {
  const durationMs = now.getTime() - call.startedAt.getTime();
  const cause = end.cause ?? endCauseOf(end.reason);
  if (end.reason === 'failed') {
    const reason = end.detail === null || end.detail === '' ? cause : end.detail;
    log.warn('voice.call_failed', { callId: call.id, reason, cause, durationMs });
  } else {
    log.info('voice.call_ended', { callId: call.id, ending: end.reason, cause, durationMs });
  }
}
