import type { AiAgentRun, AiAgentState } from '@smarteverything/domain';
import { duration } from '../../../format/time';

type RunFacts = Pick<AiAgentRun, 'state' | 'last_known_state' | 'progress' | 'updated_at'>;

const MINUTE_MS = 60_000;

const LABEL: Readonly<Record<AiAgentState, string>> = {
  queued: 'Queued',
  running: 'Running',
  waiting: 'Waiting',
  stopping: 'Stopping',
  completed: 'Done',
  stopped: 'Stopped',
  interrupted: 'Interrupted',
  failed: 'Failed',
  unknown: 'Unknown',
};

const ACTIVE: ReadonlySet<AiAgentState> = new Set(['queued', 'running', 'waiting', 'stopping']);

export function isActiveRun(run: Pick<AiAgentRun, 'state'>): boolean {
  return ACTIVE.has(run.state);
}

export function runStateLabel(run: Pick<AiAgentRun, 'state' | 'last_known_state'>): string {
  if (run.state === 'unknown' && run.last_known_state !== null) {
    return `Unknown · last known ${LABEL[run.last_known_state].toLowerCase()}`;
  }
  return LABEL[run.state];
}

export function quietHint(
  run: Pick<AiAgentRun, 'state' | 'updated_at'>,
  now: number,
): string | null {
  if (!isActiveRun(run)) return null;
  const minutes = Math.floor((now - Date.parse(run.updated_at)) / MINUTE_MS);
  return minutes < 1 ? null : `No activity for ${duration(minutes * 60)}`;
}

export function runSummary(run: RunFacts, now: number): string {
  const state = runStateLabel(run);
  const progress = run.progress?.trim() ?? '';
  const parts = [state, progress === '' ? null : progress, quietHint(run, now)];
  return parts.filter((part) => part !== null).join(' · ');
}
