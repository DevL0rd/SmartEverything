import type { StepRecord } from '@smarteverything/flow/interpret/frames';
import { background } from '@smarteverything/logging';
import type { StoreHost } from '../store/host/host';
import {
  cancellationError,
  type AutomationRunNodesRepository,
  type RunNodeActivation,
  type RunNodeEnding,
} from '../store/repositories/automation-run-nodes';
import type {
  AutomationRunRecordsRepository,
  NewRunRecord,
  RunParking,
  RunRecordChange,
} from '../store/repositories/automation-run-records';
import type { AutomationRunRecord } from '@smarteverything/domain';

export const CANCELLED_MESSAGE = 'The automation run was cancelled.';

export interface SliceStep {
  readonly step: Exclude<StepRecord, { kind: 'note' }>;
  readonly nodeId: string;
}

export interface RunSlice {
  readonly runId: string;
  readonly at: string;
  readonly steps: readonly SliceStep[];
}

export interface RunLedger {
  readonly create: (run: NewRunRecord) => void;
  readonly update: (runId: string, change: RunRecordChange) => void;
  readonly park: (runId: string, parking: RunParking) => void;
  readonly resume: (runId: string) => void;
  readonly slice: (slice: RunSlice) => void;
  readonly closeNodes: (runId: string, ending: RunNodeEnding) => void;
  readonly append: (runId: string, activations: readonly RunNodeActivation[]) => void;
  readonly active: (automationId: string) => Promise<readonly AutomationRunRecord[]>;
  readonly flushed: () => Promise<void>;
}

type NodeStep = Extract<StepRecord, { kind: 'node' }>;

function outputOf(step: NodeStep): RunNodeActivation['output'] {
  return step.outputs === undefined ? null : { value: { value: step.outputs, type: { t: 'any' } } };
}

function activationOf(step: SliceStep['step'], at: string, nodeId: string): RunNodeActivation {
  if (step.kind === 'capture') {
    return {
      path: step.activation,
      nodeId,
      iteration: 0,
      status: 'succeeded',
      startedAt: at,
      finishedAt: at,
      durationMs: 0,
      input: null,
      output: { value: { value: step.value, type: { t: 'any' } } },
      error: null,
      commandIds: [],
      late: false,
    };
  }
  const open = step.status === 'running' || step.status === 'waiting';
  return {
    path: step.activation,
    nodeId,
    iteration: 0,
    status: step.status,
    startedAt: at,
    finishedAt: open ? null : at,
    durationMs: open ? null : 0,
    input: null,
    output: outputOf(step),
    error: step.error ?? null,
    commandIds: [],
    late: false,
  };
}

function settledStatus(step: NodeStep): 'succeeded' | 'failed' | 'cancelled' | undefined {
  return step.status === 'running' || step.status === 'waiting' ? undefined : step.status;
}

function withCancellation(step: SliceStep['step'], at: string, nodeId: string): SliceStep['step'] {
  if (step.kind !== 'node' || step.status !== 'cancelled' || step.error !== undefined) return step;
  const ending = { message: CANCELLED_MESSAGE, finishedAt: at };
  return { ...step, error: cancellationError(ending, nodeId, step.activation) };
}

export function recordSlice(
  nodes: Pick<AutomationRunNodesRepository, 'append' | 'settle'>,
  { runId, at, steps }: RunSlice,
): void {
  let pending: RunNodeActivation[] = [];
  const flush = (): void => {
    nodes.append(runId, pending);
    pending = [];
  };
  for (const { step: raw, nodeId } of steps) {
    const step = withCancellation(raw, at, nodeId);
    const settled = step.kind === 'node' ? settledStatus(step) : undefined;
    if (step.kind === 'node' && settled !== undefined) {
      flush();
      const closed = nodes.settle(runId, step.activation, {
        status: settled,
        finishedAt: at,
        durationMs: 0,
        output: outputOf(step),
        ...(step.error === undefined ? {} : { error: step.error }),
      });
      if (closed) continue;
    }
    pending.push(activationOf(step, at, nodeId));
  }
  flush();
}

export function directRunLedger(
  records: Pick<AutomationRunRecordsRepository, 'create' | 'update' | 'park' | 'resume' | 'active'>,
  nodes: Pick<AutomationRunNodesRepository, 'append' | 'settle' | 'closeOpen'>,
): RunLedger {
  return {
    create: (run): void => {
      records.create(run);
    },
    update: (runId, change): void => {
      records.update(runId, change);
    },
    park: (runId, parking): void => {
      records.park(runId, parking);
    },
    resume: (runId): void => {
      records.resume(runId);
    },
    slice: (slice): void => {
      recordSlice(nodes, slice);
    },
    closeNodes: (runId, ending): void => {
      nodes.closeOpen(runId, ending);
    },
    append: (runId, activations): void => {
      nodes.append(runId, activations);
    },
    active: (automationId) => Promise.resolve(records.active(automationId)),
    flushed: () => Promise.resolve(),
  };
}

export function hostRunLedger(host: StoreHost): RunLedger {
  let tail: Promise<unknown> = Promise.resolve();
  const posted = (work: Promise<unknown>, fields: Readonly<Record<string, string>>): void => {
    tail = work;
    background(work, 'automation.run_write_failed', fields);
  };
  return {
    create: (run): void => {
      posted(host.call('automationRunRecords', 'create', run), { automationId: run.automationId });
    },
    update: (runId, change): void => {
      posted(host.call('automationRunRecords', 'update', runId, change), { runId });
    },
    park: (runId, parking): void => {
      posted(host.call('automationRunRecords', 'park', runId, parking), { runId });
    },
    resume: (runId): void => {
      posted(host.call('automationRunRecords', 'resume', runId), { runId });
    },
    slice: (slice): void => {
      posted(host.write('recordRunSlice', slice), { runId: slice.runId });
    },
    closeNodes: (runId, ending): void => {
      posted(host.call('automationRunNodes', 'closeOpen', runId, ending), { runId });
    },
    append: (runId, activations): void => {
      posted(host.call('automationRunNodes', 'append', runId, activations), { runId });
    },
    active: (automationId) => host.call('automationRunRecords', 'active', automationId),
    flushed: async (): Promise<void> => {
      await tail.then(
        () => undefined,
        () => undefined,
      );
    },
  };
}
