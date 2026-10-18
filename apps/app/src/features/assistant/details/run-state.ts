import type { AiAgentRun, AiAgentState } from '@smarteverything/domain';

type RunFacts = Pick<AiAgentRun, 'state' | 'last_known_state' | 'progress'>;

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

export function runSummary(run: RunFacts): string {
  const state = runStateLabel(run);
  const progress = run.progress?.trim() ?? '';
  return progress === '' ? state : `${state} · ${progress}`;
}
