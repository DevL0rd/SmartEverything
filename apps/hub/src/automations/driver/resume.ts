import { failureLine } from '@smarteverything/logging';
import type { AutomationRunRecord } from '@smarteverything/domain';
import { restoreRunState } from '@smarteverything/flow/state/run-state';
import type { RunState } from '@smarteverything/flow/state/run-state';
import type { Clock } from '../../clock';
import type { RunLedger } from '../run-ledger';
import type { RunStart } from './ports';

class RunResumeError extends Error {
  override readonly name = 'RunResumeError';
}

export interface ResumePorts {
  readonly runs: Pick<RunLedger, 'update'>;
  readonly plans: { readonly has: (hash: string) => boolean };
  readonly clock: Pick<Clock, 'now'>;
  readonly enabled: (automationId: string) => boolean;
  readonly rebuild: (state: RunState, record: AutomationRunRecord) => RunStart;
}

export interface ResumeTarget {
  readonly adopt: (start: RunStart) => void;
  readonly cancel: (runId: string, reason: 'disabled') => boolean;
  readonly kept: (runId: string) => void;
}

export type Restored =
  | { readonly kind: 'state'; readonly record: AutomationRunRecord; readonly state: RunState }
  | { readonly kind: 'unreadable'; readonly record: AutomationRunRecord; readonly error: string };

export type Resumed =
  | { readonly kind: 'resumed'; readonly runId: string }
  | { readonly kind: 'cancelled'; readonly runId: string }
  | { readonly kind: 'interrupted'; readonly runId: string; readonly error: string };

function restoredState(record: AutomationRunRecord): RunState {
  if (record.state === null) throw new RunResumeError('The run was waiting but saved no state.');
  try {
    return restoreRunState(JSON.stringify(record.state));
  } catch (cause) {
    throw new RunResumeError(`The saved state of the run cannot be read: ${failureLine(cause)}`);
  }
}

function checkedPlans(state: RunState, ports: Pick<ResumePorts, 'plans'>): void {
  for (const ref of state.planRefs) {
    if (!ports.plans.has(ref.hash))
      throw new RunResumeError(
        `The compiled plan ${ref.hash.slice(0, 12)} of ${ref.id} revision ${String(ref.revision)} is not stored, so the run cannot continue.`,
      );
  }
}

function interrupt(record: AutomationRunRecord, error: string, ports: ResumePorts): Resumed {
  ports.runs.update(record.id, {
    status: 'interrupted',
    current_node: null,
    error,
    finished_at: ports.clock.now().toISOString(),
    state: null,
    wake_at: null,
    waiting_on: null,
  });
  return { kind: 'interrupted', runId: record.id, error };
}

export function restoredRun(record: AutomationRunRecord): Restored {
  try {
    const state = restoredState(record);
    if (state.wait === undefined)
      throw new RunResumeError('The run was waiting but its saved state holds no wait.');
    return { kind: 'state', record, state };
  } catch (cause) {
    return { kind: 'unreadable', record, error: failureLine(cause) };
  }
}

export function resumeRun(restored: Restored, ports: ResumePorts, target: ResumeTarget): Resumed {
  const { record } = restored;
  if (restored.kind === 'unreadable') return interrupt(record, restored.error, ports);
  let start: RunStart;
  try {
    checkedPlans(restored.state, ports);
    start = ports.rebuild(restored.state, record);
  } catch (cause) {
    return interrupt(record, failureLine(cause), ports);
  }
  target.kept(record.id);
  target.adopt(start);
  if (ports.enabled(record.automation_id)) return { kind: 'resumed', runId: record.id };
  target.cancel(record.id, 'disabled');
  return { kind: 'cancelled', runId: record.id };
}
