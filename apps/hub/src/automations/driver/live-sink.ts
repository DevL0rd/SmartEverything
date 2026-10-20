import {
  JSON_VALUE,
  traceSubjectOf,
  traceSubject,
  type AutomationTraceNotice,
  type ClientRow,
  type TraceNodeStateNotice,
  type TraceRun,
  type TraceWait,
} from '@smarteverything/domain';
import type { StepRecord } from '@smarteverything/flow/interpret/frames';
import type { RunState, SingleWait, Wait } from '@smarteverything/flow/state/run-state';
import { portPreview } from '../../store/repositories/automation-run-nodes';
import type { TraceSource } from '../../server/live-watch';
import { traceAllowed, type TraceOwners, type TraceProfiles } from '../../server/live-visibility';
import type { Viewers } from '../../metrics/viewers';
import type { RunSink } from './ports';

export interface LiveSinkParts {
  readonly inner: RunSink;
  readonly watched: (subject: string) => boolean;
  readonly publish: (notice: AutomationTraceNotice) => void;
}

function wakeOf(wait: SingleWait): number | null {
  if ('dueAt' in wait) return wait.dueAt;
  const deadline = 'deadlineAt' in wait ? wait.deadlineAt : undefined;
  const hold = 'holdUntil' in wait ? wait.holdUntil : undefined;
  return deadline ?? hold ?? null;
}

function earliest(left: number | null, right: number | null): number | null {
  if (left === null) return right;
  return right === null || left <= right ? left : right;
}

export function traceWaitOf(wait: Wait): TraceWait {
  const due =
    wait.kind === 'any'
      ? wait.waits.map(wakeOf).reduce<number | null>(earliest, null)
      : wakeOf(wait);
  return { kind: wait.kind, wakeAt: due === null ? null : new Date(due).toISOString() };
}

function nodeState(
  automationId: string,
  runId: string,
  step: Extract<StepRecord, { kind: 'capture' }>,
): TraceNodeStateNotice {
  const preview = portPreview({ value: step.value, type: { t: 'any' } });
  return {
    type: 'trace_node_state',
    automationId,
    runId,
    path: step.activation,
    status: 'succeeded',
    iteration: 0,
    durationMs: 0,
    outputPreview: { value: JSON_VALUE.parse(preview.value) },
  };
}

function parkedNotice(automationId: string, runId: string, wait: Wait): AutomationTraceNotice {
  return { type: 'trace_run_parked', automationId, runId, ...traceWaitOf(wait) };
}

function lastPerPath(records: readonly StepRecord[]): Extract<StepRecord, { kind: 'capture' }>[] {
  const latest = new Map<string, Extract<StepRecord, { kind: 'capture' }>>();
  for (const step of records) {
    if (step.kind === 'capture') latest.set(step.activation, step);
  }
  return [...latest.values()];
}

interface Tracked {
  readonly known: (state: RunState) => void;
  readonly seen: (runId: string) => string | undefined;
  readonly forget: (runId: string) => void;
}

function tracked(watched: (subject: string) => boolean): Tracked {
  const automations = new Map<string, string>();
  return {
    known: (state): void => {
      automations.set(state.runId, state.automationId);
    },
    seen: (runId): string | undefined => {
      const automationId = automations.get(runId);
      return automationId !== undefined &&
        (watched(traceSubject('automation', automationId)) || watched(traceSubject('run', runId)))
        ? automationId
        : undefined;
    },
    forget: (runId): void => {
      automations.delete(runId);
    },
  };
}

export function liveSink(parts: LiveSinkParts): RunSink {
  const { inner, publish } = parts;
  const { known, seen, forget } = tracked(parts.watched);
  const ended = (state: RunState, outcome: 'succeeded' | 'failed' | 'cancelled'): void => {
    const automationId = seen(state.runId);
    forget(state.runId);
    if (automationId === undefined) return;
    publish({ type: 'trace_run_finished', automationId, runId: state.runId, outcome });
  };
  return {
    queued: (state, kind): void => {
      known(state);
      inner.queued(state, kind);
    },
    dropped: (state, because): void => {
      inner.dropped(state, because);
      ended(state, 'cancelled');
    },
    started: (state, kind): void => {
      known(state);
      inner.started(state, kind);
    },
    slice: (runId, records): void => {
      inner.slice(runId, records);
      const automationId = seen(runId);
      if (automationId === undefined) return;
      lastPerPath(records).forEach((step) => {
        publish(nodeState(automationId, runId, step));
      });
    },
    parked: (state): void => {
      inner.parked(state);
      const automationId = seen(state.runId);
      if (automationId === undefined || state.wait === undefined) return;
      publish(parkedNotice(automationId, state.runId, state.wait));
    },
    resumed: (state, lateMs): void => {
      known(state);
      inner.resumed(state, lateMs);
    },
    finished: (state, ending, kind): void => {
      inner.finished(state, ending, kind);
      ended(state, ending.status);
    },
  };
}

export interface TraceWatchSourceParts {
  readonly viewers: Pick<Viewers, 'hold' | 'release'>;
  readonly owners: TraceOwners;
  readonly store: TraceProfiles;
  readonly runs: (subject: string) => readonly TraceRun[];
  readonly now: () => string;
}

export function traceWatchSource(parts: TraceWatchSourceParts): TraceSource {
  return {
    viewers: parts.viewers,
    allowed: (client: ClientRow, subject: string): boolean =>
      traceAllowed(client, subject, parts.owners, parts.store),
    keyframe: (subject: string): AutomationTraceNotice | null => {
      const parsed = traceSubjectOf(subject);
      const runs = parts.runs(subject);
      const automationId = parsed?.kind === 'automation' ? parsed.id : runs[0]?.automationId;
      return automationId === undefined
        ? null
        : { type: 'trace_keyframe', automationId, at: parts.now(), runs: [...runs] };
    },
  };
}
