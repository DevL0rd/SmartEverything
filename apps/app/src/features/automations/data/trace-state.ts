import type {
  AutomationTraceNotice,
  RunRecordStatus,
  TraceNodeState,
  TraceRun,
  TraceWait,
} from '@smarteverything/domain';

export interface TraceRunState {
  readonly runId: string;
  readonly automationId: string;
  readonly status: RunRecordStatus;
  readonly activePaths: readonly string[];
  readonly nodes: Readonly<Record<string, TraceNodeState>>;
  readonly wait: TraceWait | null;
}

export interface TraceState {
  readonly runs: Readonly<Record<string, TraceRunState>>;
  readonly at: string | null;
}

export const EMPTY_TRACE: TraceState = { runs: {}, at: null };

function runOf(run: TraceRun): TraceRunState {
  return {
    runId: run.runId,
    automationId: run.automationId,
    status: run.status,
    activePaths: run.activePaths,
    nodes: Object.fromEntries(run.lastNodeStates.map((node) => [node.path, node])),
    wait: run.wait,
  };
}

function known(state: TraceState, runId: string, automationId: string): TraceRunState {
  return (
    state.runs[runId] ?? {
      runId,
      automationId,
      status: 'running',
      activePaths: [],
      nodes: {},
      wait: null,
    }
  );
}

function withRun(state: TraceState, run: TraceRunState): TraceState {
  return { ...state, runs: { ...state.runs, [run.runId]: run } };
}

function pathsAfter(paths: readonly string[], node: TraceNodeState): readonly string[] {
  const rest = paths.filter((path) => path !== node.path);
  return node.status === 'running' ? [...rest, node.path] : rest;
}

export function traceReduce(state: TraceState, notice: AutomationTraceNotice): TraceState {
  switch (notice.type) {
    case 'trace_keyframe': {
      const others = Object.values(state.runs).filter(
        (run) => run.automationId !== notice.automationId,
      );
      const runs = [...others, ...notice.runs.map(runOf)];
      return { runs: Object.fromEntries(runs.map((run) => [run.runId, run])), at: notice.at };
    }
    case 'trace_node_state': {
      const node: TraceNodeState = {
        path: notice.path,
        status: notice.status,
        iteration: notice.iteration,
        durationMs: notice.durationMs,
        ...(notice.outputPreview === undefined ? {} : { outputPreview: notice.outputPreview }),
      };
      const run = known(state, notice.runId, notice.automationId);
      return withRun(state, {
        ...run,
        status: run.status === 'waiting' && node.status === 'running' ? 'running' : run.status,
        activePaths: pathsAfter(run.activePaths, node),
        nodes: { ...run.nodes, [node.path]: node },
        wait: node.status === 'running' ? null : run.wait,
      });
    }
    case 'trace_run_parked': {
      const run = known(state, notice.runId, notice.automationId);
      return withRun(state, {
        ...run,
        status: 'waiting',
        wait: { kind: notice.kind, wakeAt: notice.wakeAt },
      });
    }
    case 'trace_run_finished': {
      const run = known(state, notice.runId, notice.automationId);
      return withRun(state, { ...run, status: notice.outcome, activePaths: [], wait: null });
    }
  }
}

export function activeRunsOf(state: TraceState): readonly TraceRunState[] {
  return Object.values(state.runs).filter(
    (run) => run.status !== 'succeeded' && run.status !== 'failed' && run.status !== 'cancelled',
  );
}

export function traceGateOpen(focused: boolean, foreground: boolean, onScreen: boolean): boolean {
  return focused && foreground && onScreen;
}
