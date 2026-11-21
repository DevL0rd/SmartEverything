import type { Clock } from '../clock';
import type { StepRecord } from '@smarteverything/flow/interpret/frames';
import type { FeedbackChains } from './driver/feedback';
import type { RunParkStore } from './driver/park-store';
import { liveSink } from './driver/live-sink';
import type { LiveSinkParts } from './driver/live-sink';
import type { FinishedRun, RunSink } from './driver/ports';
import type { RunOutputs } from './engine-v3-children';
import { CANCELLED_MESSAGE, type RunLedger } from './run-ledger';

interface SinkParts {
  readonly clock: Pick<Clock, 'now'>;
  readonly runs: Pick<RunLedger, 'update' | 'slice' | 'closeNodes'>;
  readonly parks: RunParkStore;
  readonly chains: FeedbackChains;
  readonly closed: (runId: string) => void;
  readonly nodeId: (runId: string, key: string) => string | undefined;
  readonly cancelled: (runId: string, because: string) => void;
}

function nodeWriters(parts: SinkParts): {
  readonly slicer: (runId: string, steps: readonly StepRecord[]) => void;
  readonly closeNodes: (runId: string) => void;
} {
  const { clock, runs, nodeId } = parts;
  return {
    slicer: (runId, steps): void => {
      const at = clock.now().toISOString();
      const kept = steps.flatMap((step) => {
        if (step.kind === 'note') return [];
        const id = nodeId(runId, step.node);
        return id === undefined ? [] : [{ step, nodeId: id }];
      });
      runs.slice({ runId, at, steps: kept });
    },
    closeNodes: (runId): void => {
      runs.closeNodes(runId, {
        message: CANCELLED_MESSAGE,
        finishedAt: clock.now().toISOString(),
      });
    },
  };
}

function runSink(parts: SinkParts): RunSink {
  const { clock, runs, parks, chains, closed, cancelled } = parts;
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
      runs.update(state.runId, {
        status: 'cancelled',
        error: because,
        finished_at: clock.now().toISOString(),
      });
    },
    started: (state): void => {
      runs.update(state.runId, { status: 'running', started_at: clock.now().toISOString() });
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
      runs.update(state.runId, {
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
