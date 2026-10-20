import { useCallback, useMemo, useState } from 'react';
import type {
  AutomationRunSummary,
  RunRecordStatus,
  TraceNodeState,
} from '@smarteverything/domain';
import type { RunOverlay } from '../../model/canvas/contract';
import { useRunTrace } from '../../data/use-run-trace';
import type { TraceState } from '../../data/trace-state';
import { isActive } from '../run-history-model';
import {
  activationOfRecord,
  activationOfTrace,
  mergeActivations,
  type Activation,
} from './run-activation';
import { resolveLoops, sameLoops, type LoopInfo } from './run-loops';
import { overlayOf, runningNodeOf } from './run-overlay';
import { boundsOf, timelineOf, type TimelineModel } from './run-timeline';
import type { RunRecords } from './use-run-records';

export interface RunOverlayInput {
  readonly runId: string;
  readonly records: RunRecords | undefined;
  readonly titles: ReadonlyMap<string, string>;
  readonly itemNames: ReadonlyMap<string, string>;
  readonly zone: string | null;
  readonly onScreen: boolean;
}

export interface RunOverlayModel {
  readonly run: AutomationRunSummary | null;
  readonly status: RunRecordStatus | null;
  readonly live: boolean;
  readonly active: boolean;
  readonly activations: readonly Activation[];
  readonly chosen: ReadonlyMap<string, number>;
  readonly loops: readonly LoopInfo[];
  readonly overlay: RunOverlay;
  readonly timeline: TimelineModel | null;
  readonly running: string | null;
  readonly at: number | null;
  readonly pick: (loopId: string, iteration: number) => void;
  readonly scrub: (at: number | null) => void;
}

const NO_ACTIVATIONS: readonly Activation[] = [];

type TraceNodes = Readonly<Record<string, TraceNodeState>>;

export function liveActivations(
  stored: readonly Activation[],
  nodes: TraceNodes,
): readonly Activation[] {
  const byPath = new Map(stored.map((activation) => [activation.path, activation]));
  const top = Math.max(0, ...stored.map((activation) => activation.seq));
  return Object.values(nodes).map((node, index) =>
    activationOfTrace(node, top + 1 + index, byPath.get(node.path)),
  );
}

function useActivations(
  records: RunRecords | undefined,
  traceNodes: TraceNodes,
): readonly Activation[] {
  const stored = useMemo(
    () => (records === undefined ? NO_ACTIVATIONS : records.nodes.map(activationOfRecord)),
    [records],
  );
  return useMemo(
    () => mergeActivations(stored, liveActivations(stored, traceNodes)),
    [stored, traceNodes],
  );
}

function useStableLoops(next: readonly LoopInfo[]): readonly LoopInfo[] {
  const [held, setHeld] = useState(next);
  if (sameLoops(held, next)) return held;
  setHeld(next);
  return next;
}

const NO_NODES: TraceNodes = {};

interface LoopControl {
  readonly loops: readonly LoopInfo[];
  readonly chosen: ReadonlyMap<string, number>;
  readonly pick: (loopId: string, iteration: number) => void;
}

function useLoopControl(activations: readonly Activation[]): LoopControl {
  const [selected, setSelected] = useState<ReadonlyMap<string, number>>(new Map());
  const pick = useCallback((loopId: string, iteration: number): void => {
    setSelected((current) => new Map(current).set(loopId, iteration));
  }, []);
  const resolved = useMemo(() => resolveLoops(activations, selected), [activations, selected]);
  const loops = useStableLoops(resolved.loops);
  return { loops, chosen: resolved.chosen, pick };
}

interface OverlayBasis {
  readonly input: RunOverlayInput;
  readonly control: LoopControl;
  readonly activations: readonly Activation[];
  readonly at: number | null;
  readonly wakeAt: string | null;
}

function useOverlay({ input, control, activations, at, wakeAt }: OverlayBasis): RunOverlay {
  const { itemNames, zone } = input;
  const { loops, chosen } = control;
  return useMemo(
    () => overlayOf({ activations, chosen, loops, itemNames, at, wakeAt, zone }),
    [activations, chosen, loops, itemNames, at, wakeAt, zone],
  );
}

interface LiveRun {
  readonly nodes: TraceNodes;
  readonly status: RunRecordStatus | null;
  readonly wakeAt: string | null;
  readonly live: boolean;
  readonly active: boolean;
}

type Traced = TraceState['runs'][string] | undefined;

function statusOf(traced: Traced, run: AutomationRunSummary | null): RunRecordStatus | null {
  return traced?.status ?? run?.status ?? null;
}

function wakeOf(traced: Traced, run: AutomationRunSummary | null): string | null {
  return traced?.wait?.wakeAt ?? run?.wake_at ?? null;
}

function useLiveRun(input: RunOverlayInput): LiveRun {
  const run = input.records?.run ?? null;
  const active = run !== null && isActive(run.status);
  const trace = useRunTrace({ runId: input.runId }, input.onScreen && active);
  const traced = trace.state.runs[input.runId];
  return {
    nodes: traced?.nodes ?? NO_NODES,
    status: statusOf(traced, run),
    wakeAt: wakeOf(traced, run),
    live: trace.live && active,
    active,
  };
}

export function useRunOverlay(input: RunOverlayInput): RunOverlayModel {
  const run = input.records?.run ?? null;
  const { nodes, status, wakeAt, live, active } = useLiveRun(input);
  const activations = useActivations(input.records, nodes);
  const control = useLoopControl(activations);
  const [at, scrub] = useState<number | null>(null);
  const overlay = useOverlay({ input, control, activations, at, wakeAt });
  const timeline = useMemo(
    () => (run === null ? null : timelineOf(activations, input.titles, boundsOf(run, activations))),
    [run, activations, input.titles],
  );
  const running = useMemo(
    () => runningNodeOf(activations, control.chosen),
    [activations, control.chosen],
  );
  return {
    run,
    status,
    live,
    active,
    activations,
    ...control,
    overlay,
    timeline,
    running,
    at,
    scrub,
  };
}
