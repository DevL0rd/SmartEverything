import type { Clock } from '../clock';
import type { StepRecord } from '@smarteverything/flow/interpret/frames';
import { cancellationError } from '../store/repositories/automation-run-nodes';
import type {
  AutomationRunNodesRepository,
  RunNodeActivation,
} from '../store/repositories/automation-run-nodes';
import type { AutomationRunRecordsRepository } from '../store/repositories/automation-run-records';
import type { FeedbackChains } from './driver/feedback';
import type { RunParkStore } from './driver/park-store';
import { liveSink } from './driver/live-sink';
import type { LiveSinkParts } from './driver/live-sink';
import type { FinishedRun, RunSink } from './driver/ports';
import type { RunOutputs } from './engine-v3-children';

interface SinkParts {
  readonly clock: Pick<Clock, 'now'>;
  readonly records: Pick<AutomationRunRecordsRepository, 'update'>;
  readonly nodes: Pick<AutomationRunNodesRepository, 'append' | 'settle' | 'closeOpen'>;
  readonly parks: RunParkStore;
  readonly chains: FeedbackChains;
  readonly closed: (runId: string) => void;
  readonly nodeId: (runId: string, key: string) => string | undefined;
  readonly cancelled: (runId: string, because: string) => void;
}

type NodeStep = Extract<StepRecord, { kind: 'node' }>;

export const CANCELLED_MESSAGE = 'The automation run was cancelled.';

function activationOf(step: StepRecord, at: string, nodeId: string): RunNodeActivation | undefined {
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
  if (step.kind !== 'node') return undefined;
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
    output: null,
    error: step.error ?? null,
    commandIds: [],
    late: false,
  };
}

function settledStatus(step: NodeStep): 'succeeded' | 'failed' | 'cancelled' | undefined {
  return step.status === 'running' || step.status === 'waiting' ? undefined : step.status;
}

function withCancellation(step: StepRecord, at: string, nodeId: string): StepRecord {
  if (step.kind !== 'node' || step.status !== 'cancelled' || step.error !== undefined) return step;
  const ending = { message: CANCELLED_MESSAGE, finishedAt: at };
  return { ...step, error: cancellationError(ending, nodeId, step.activation) };
}

interface Slice {
  readonly nodes: SinkParts['nodes'];
  readonly runId: string;
  readonly at: string;
  readonly idOf: (key: string) => string | undefined;
}

function record(slice: Slice, steps: readonly StepRecord[]): void {
  const { nodes, runId, at, idOf } = slice;
  let pending: RunNodeActivation[] = [];
  const flush = (): void => {
    nodes.append(runId, pending);
    pending = [];
  };
  for (const raw of steps) {
    const nodeId = raw.kind === 'note' ? undefined : idOf(raw.node);
    if (nodeId === undefined) continue;
    const step = withCancellation(raw, at, nodeId);
    const settled = step.kind === 'node' ? settledStatus(step) : undefined;
    if (step.kind === 'node' && settled !== undefined) {
      flush();
      const closed = nodes.settle(runId, step.activation, {
        status: settled,
        finishedAt: at,
        durationMs: 0,
        ...(step.error === undefined ? {} : { error: step.error }),
      });
      if (closed) continue;
    }
    const activation = activationOf(step, at, nodeId);
    if (activation !== undefined) pending.push(activation);
  }
  flush();
}

function nodeWriters(parts: SinkParts): {
  readonly slicer: (runId: string, steps: readonly StepRecord[]) => void;
  readonly closeNodes: (runId: string) => void;
} {
  const { clock, nodes, nodeId } = parts;
  return {
    slicer: (runId, steps): void => {
      const at = clock.now().toISOString();
      record({ nodes, runId, at, idOf: (key) => nodeId(runId, key) }, steps);
    },
    closeNodes: (runId): void => {
      nodes.closeOpen(runId, { message: CANCELLED_MESSAGE, finishedAt: clock.now().toISOString() });
    },
  };
}

function runSink(parts: SinkParts): RunSink {
  const { clock, records, parks, chains, closed, cancelled } = parts;
  const ended = (runId: string): void => {
    chains.end(runId, clock.now().getTime());
    closed(runId);
  };
  const { slicer, closeNodes } = nodeWriters(parts);
  return {
    queued: (): void => undefined,
    dropped: (state, because): void => {
      closeNodes(state.runId);
      ended(state.runId);
      cancelled(state.runId, because);
      records.update(state.runId, {
        status: 'cancelled',
        error: because,
        finished_at: clock.now().toISOString(),
      });
    },
    started: (state): void => {
      records.update(state.runId, { status: 'running', started_at: clock.now().toISOString() });
    },
    slice: (runId, steps): void => {
      slicer(runId, steps);
    },
    parked: (state): void => {
      parks.parked(state);
    },
    resumed: (state): void => {
      parks.resumed(state);
    },
    finished: (state, ending): void => {
      if (ending.status !== 'succeeded') closeNodes(state.runId);
      parks.ended(state.runId);
      ended(state.runId);
      records.update(state.runId, {
        status: ending.status,
        error: ending.error?.message ?? (ending.status === 'cancelled' ? CANCELLED_MESSAGE : null),
        finished_at: clock.now().toISOString(),
        steps: state.budgets.steps,
        state: null,
        wake_at: null,
        waiting_on: null,
      });
    },
  };
}

export interface EngineSinkParts extends Omit<SinkParts, 'cancelled'> {
  readonly settle: (finished: FinishedRun) => void;
  readonly keep: (runId: string, outputs: RunOutputs) => void;
  readonly trace: Pick<LiveSinkParts, 'watched' | 'publish'> | undefined;
}

export function engineSink(parts: EngineSinkParts): RunSink {
  const { settle, keep, trace, ...rest } = parts;
  const stored = runSink({
    ...rest,
    cancelled: (runId, because) => {
      settle({
        runId,
        automationId: '',
        name: '',
        outcome: 'cancelled',
        durationMs: 0,
        error: because,
      });
    },
  });
  const kept: RunSink = {
    ...stored,
    finished: (state, ending, kind): void => {
      keep(state.runId, ending.outputs ?? null);
      stored.finished(state, ending, kind);
    },
  };
  return trace === undefined ? kept : liveSink({ inner: kept, ...trace });
}
