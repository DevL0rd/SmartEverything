import { appendTo, type AutomationRunSummary } from '@smarteverything/domain';
import type { TimelineSegment } from '../../../../components/charts/timeline-model';
import type { Activation, ActivationStatus } from './run-activation';

export type RowState = 'ok' | 'failed' | 'running' | 'waiting' | 'skipped';

export const ROW_STATES: readonly RowState[] = ['ok', 'failed', 'running', 'waiting', 'skipped'];

const ROW_STATE_OF: Readonly<Record<ActivationStatus, RowState>> = {
  succeeded: 'ok',
  failed: 'failed',
  running: 'running',
  waiting: 'waiting',
  skipped: 'skipped',
  cancelled: 'skipped',
};

const MIN_SHARE = 1 / 200;

export interface TimelineRow {
  readonly nodeId: string;
  readonly title: string;
  readonly segments: readonly TimelineSegment<RowState>[];
}

export interface Bounds {
  readonly from: number;
  readonly to: number;
}

export interface TimelineModel {
  readonly bounds: Bounds;
  readonly rows: readonly TimelineRow[];
}

function momentMs(moment: string | null): number | null {
  return moment === null ? null : Date.parse(moment);
}

export function boundsOf(
  run: Pick<AutomationRunSummary, 'started_at' | 'created_at' | 'finished_at'>,
  activations: readonly Activation[],
): Bounds {
  const from = momentMs(run.started_at) ?? Date.parse(run.created_at);
  const seen = activations.flatMap((activation) => [activation.startMs, activation.endMs]);
  const known = [from, ...seen.filter((time): time is number => time !== null)];
  const last = momentMs(run.finished_at) ?? Math.max(...known);
  return { from, to: Math.max(last, from + 1) };
}

function segmentOf(activation: Activation, bounds: Bounds): TimelineSegment<RowState> | null {
  if (activation.startMs === null) return null;
  const minimum = (bounds.to - bounds.from) * MIN_SHARE;
  const end = Math.max(activation.endMs ?? bounds.to, activation.startMs + minimum);
  return { start: activation.startMs, end, state: ROW_STATE_OF[activation.status] };
}

function distinct(
  segments: readonly TimelineSegment<RowState>[],
): readonly TimelineSegment<RowState>[] {
  const byKey = new Map<string, TimelineSegment<RowState>>();
  for (const segment of segments) {
    const key = `${String(segment.start)}-${segment.state}`;
    const held = byKey.get(key);
    if (held === undefined || held.end < segment.end) byKey.set(key, segment);
  }
  return [...byKey.values()];
}

export function timelineOf(
  activations: readonly Activation[],
  titles: ReadonlyMap<string, string>,
  bounds: Bounds,
): TimelineModel {
  const byNode = new Map<string, TimelineSegment<RowState>[]>();
  for (const activation of activations) {
    const segment = segmentOf(activation, bounds);
    if (segment === null) continue;
    appendTo(byNode, activation.nodeId, segment);
  }
  const rows = [...byNode].map(([nodeId, segments]) => ({
    nodeId,
    title: titles.get(nodeId) ?? nodeId,
    segments: distinct(segments),
  }));
  const first = (row: TimelineRow): number => Math.min(...row.segments.map((s) => s.start));
  return { bounds, rows: rows.sort((left, right) => first(left) - first(right)) };
}

export function offsetOf(at: number | null, bounds: Bounds): number {
  return at === null ? bounds.to - bounds.from : at - bounds.from;
}
