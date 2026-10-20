import { JSON_VALUE } from '@smarteverything/domain';
import type { JsonValue } from '@smarteverything/domain';
import { wakeAt } from '@smarteverything/flow/interpret/waits';
import { serialiseRunState } from '@smarteverything/flow/state/run-state';
import type { RunState, Wait } from '@smarteverything/flow/state/run-state';
import { z } from 'zod';
import type { Clock } from '../../clock';
import type {
  AutomationRunRecordsRepository,
  RunParking,
} from '../../store/repositories/automation-run-records';

export const DURABLE_PARK_MS = 5000;

const STATE_OBJECT = z.record(z.string(), JSON_VALUE);

export type ParkRecords = Pick<AutomationRunRecordsRepository, 'park' | 'resume'>;

function waitingOn(wait: Wait, due: number | undefined): RunParking['waitingOn'] {
  const leaves = wait.kind === 'any' ? wait.waits : [wait];
  const fields: Record<string, JsonValue> = {
    kind: wait.kind,
    nodePath: wait.nodePath,
    leaves: leaves.map((leaf) => leaf.kind),
  };
  if (due !== undefined) fields['wakeAt'] = new Date(due).toISOString();
  return fields;
}

export function parkingOf(state: RunState, now: number): RunParking | undefined {
  const { wait } = state;
  if (wait?.durable !== true) return undefined;
  const due = wakeAt(wait);
  if (due !== undefined && due - now < DURABLE_PARK_MS) return undefined;
  return {
    state: STATE_OBJECT.parse(JSON.parse(serialiseRunState(state))),
    wakeAt: due === undefined ? null : new Date(due).toISOString(),
    waitingOn: waitingOn(wait, due),
    activePaths: state.frames.map((frame) => frame.path),
  };
}

export class RunParkStore {
  private readonly checkpointed = new Set<string>();

  constructor(
    private readonly records: ParkRecords,
    private readonly clock: Pick<Clock, 'now'>,
  ) {}

  get kept(): ReadonlySet<string> {
    return this.checkpointed;
  }

  parked(state: RunState): boolean {
    const parking = parkingOf(state, this.clock.now().getTime());
    if (parking === undefined) return false;
    this.records.park(state.runId, parking);
    this.checkpointed.add(state.runId);
    return true;
  }

  adopted(runId: string): void {
    this.checkpointed.add(runId);
  }

  resumed(state: RunState): void {
    if (!this.checkpointed.delete(state.runId)) return;
    this.records.resume(state.runId);
  }

  ended(runId: string): void {
    this.checkpointed.delete(runId);
  }
}
