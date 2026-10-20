import type { HistoryBucket, HistoryRow } from '@smarteverything/domain';
import { DAY_MS, HOUR_MS, MINUTE_MS, hoursMinutes } from '../../../format/time';
import type { MemberPower } from '../use-target-state';

const BUCKET_MIDPOINT_MS = HOUR_MS / 2;

export interface PowerChange {
  readonly at: number;
  readonly on: boolean;
}

interface LaneSpan {
  readonly start: number;
  readonly end: number;
}

export interface Lane {
  readonly spans: readonly LaneSpan[];
  readonly onMs: number;
  readonly knownFrom: number;
}

export interface LaneWindow {
  readonly from: number;
  readonly to: number;
}

export type Window = 'day' | 'week';

const WINDOW_SPAN: Readonly<Record<Window, number>> = { day: DAY_MS, week: 7 * DAY_MS };

export function windowAt(window: Window, now: number): LaneWindow {
  return { from: now - WINDOW_SPAN[window], to: now };
}

export function changesByDevice(
  rows: readonly HistoryRow[],
  keyOf: (deviceId: string) => string | undefined,
): ReadonlyMap<string, readonly PowerChange[]> {
  const byDevice = new Map<string, PowerChange[]>();
  for (const row of rows) {
    if (typeof row.value !== 'boolean' || keyOf(row.device_id) !== row.capability) continue;
    const list = byDevice.get(row.device_id) ?? [];
    list.push({ at: Date.parse(row.observed_at), on: row.value });
    byDevice.set(row.device_id, list);
  }
  for (const list of byDevice.values()) list.sort((left, right) => left.at - right.at);
  return byDevice;
}

export function bucketChanges(
  buckets: readonly HistoryBucket[],
  keyOf: (deviceId: string) => string | undefined,
  from: number,
): ReadonlyMap<string, readonly PowerChange[]> {
  const byDevice = new Map<string, PowerChange[]>();
  for (const bucket of buckets) {
    const at = Date.parse(bucket.bucket_start);
    if (typeof bucket.last !== 'boolean' || keyOf(bucket.device_id) !== bucket.capability) continue;
    if (at < from) continue;
    const list = byDevice.get(bucket.device_id) ?? [];
    list.push({ at: at + BUCKET_MIDPOINT_MS, on: bucket.last });
    byDevice.set(bucket.device_id, list);
  }
  for (const list of byDevice.values()) list.sort((left, right) => left.at - right.at);
  return byDevice;
}

export function stateBefore(
  buckets: readonly HistoryBucket[],
  keyOf: (deviceId: string) => string | undefined,
  from: number,
): ReadonlyMap<string, boolean> {
  const latest = new Map<string, { readonly at: number; readonly on: boolean }>();
  for (const bucket of buckets) {
    const at = Date.parse(bucket.bucket_start);
    if (typeof bucket.last !== 'boolean' || keyOf(bucket.device_id) !== bucket.capability) continue;
    if (at >= from || at < (latest.get(bucket.device_id)?.at ?? -Infinity)) continue;
    latest.set(bucket.device_id, { at, on: bucket.last });
  }
  return new Map([...latest].map(([deviceId, found]) => [deviceId, found.on]));
}

interface LaneStart {
  readonly known: number;
  readonly on: boolean;
}

function startOf(
  inside: readonly PowerChange[],
  before: boolean | undefined,
  window: LaneWindow,
): LaneStart {
  if (before !== undefined) return { known: window.from, on: before };
  const first = inside[0];
  return first === undefined ? { known: window.to, on: false } : { known: first.at, on: first.on };
}

function spansOf(
  inside: readonly PowerChange[],
  start: LaneStart,
  end: number,
): readonly LaneSpan[] {
  const spans: LaneSpan[] = [];
  let on = start.on;
  let since = start.known;
  for (const change of inside) {
    if (change.at < start.known || change.on === on) continue;
    if (on) spans.push({ start: since, end: change.at });
    on = change.on;
    since = change.at;
  }
  if (on && since < end) spans.push({ start: since, end });
  return spans;
}

export function laneOf(
  changes: readonly PowerChange[],
  before: boolean | undefined,
  window: LaneWindow,
): Lane {
  const inside = changes.filter((change) => change.at >= window.from && change.at <= window.to);
  const start = startOf(inside, before, window);
  const spans = spansOf(inside, start, window.to);
  return {
    spans,
    onMs: spans.reduce((total, span) => total + span.end - span.start, 0),
    knownFrom: start.known,
  };
}

export function hasHistory(lane: Lane, window: LaneWindow): boolean {
  return lane.knownFrom < window.to;
}

export function startsUnknown(lane: Lane, window: LaneWindow): boolean {
  return lane.knownFrom > window.from;
}

export interface PowerFlip extends PowerChange {
  readonly deviceId: string;
}

export interface FlipStep {
  readonly known: ReadonlyMap<string, boolean>;
  readonly flips: readonly PowerFlip[];
}

export function flipsOf(
  known: ReadonlyMap<string, boolean>,
  powers: Readonly<Record<string, MemberPower>>,
  at: number,
): FlipStep {
  const next = new Map(known);
  const flips: PowerFlip[] = [];
  for (const [deviceId, power] of Object.entries(powers)) {
    if (power === 'offline' || power === 'unknown') continue;
    const on = power === 'on';
    const before = known.get(deviceId);
    if (before !== undefined && before !== on) flips.push({ deviceId, at, on });
    next.set(deviceId, on);
  }
  return { known: next, flips };
}

export function withFlips(
  changes: ReadonlyMap<string, readonly PowerChange[]>,
  flips: readonly PowerFlip[],
): ReadonlyMap<string, readonly PowerChange[]> {
  if (flips.length === 0) return changes;
  const merged = new Map(changes);
  for (const flip of flips) {
    const list = merged.get(flip.deviceId) ?? [];
    merged.set(flip.deviceId, [...list, { at: flip.at, on: flip.on }]);
  }
  return merged;
}

export interface DayCell {
  readonly ms: number;
  readonly known: boolean;
}

export function dayCells(lane: Lane, window: LaneWindow, cells: number): readonly DayCell[] {
  const width = (window.to - window.from) / cells;
  return Array.from({ length: cells }, (_, index) => {
    const start = window.from + index * width;
    const ms = lane.spans.reduce(
      (total, span) =>
        total + Math.max(0, Math.min(span.end, start + width) - Math.max(span.start, start)),
      0,
    );
    return { ms, known: lane.knownFrom < start + width };
  });
}

const HOUR = DAY_MS / 24;
const OPACITY_STEPS: readonly (readonly [number, number])[] = [
  [3, 0.35],
  [8, 0.55],
  [16, 0.78],
];

export function cellOpacity(ms: number): number {
  if (ms <= 0) return 0;
  const hours = ms / HOUR;
  return OPACITY_STEPS.find(([below]) => hours < below)?.[1] ?? 1;
}

export interface LaneSummary {
  readonly text: string;
  readonly spoken: string;
}

export function laneSummary(
  lane: Lane,
  window: LaneWindow,
  offline: boolean,
  span: Window,
): LaneSummary {
  const when = span === 'day' ? 'today' : 'this week';
  if (!hasHistory(lane, window)) {
    return { text: 'No history yet', spoken: 'no history yet' };
  }
  const base =
    lane.onMs === 0
      ? { text: `Off ${when}`, spoken: `off ${when}` }
      : { text: `On ${totalText(lane.onMs)}`, spoken: `on ${spokenTotal(lane.onMs)} ${when}` };
  return offline
    ? { text: `${base.text} · offline now`, spoken: `${base.spoken}, offline now` }
    : base;
}

export function totalText(ms: number): string {
  return hoursMinutes(ms / MINUTE_MS);
}

export function spokenTotal(ms: number): string {
  const minutes = Math.round(ms / MINUTE_MS);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const parts = [
    ...(hours === 0 ? [] : [`${String(hours)} ${hours === 1 ? 'hour' : 'hours'}`]),
    ...(rest === 0 && hours > 0 ? [] : [`${String(rest)} ${rest === 1 ? 'minute' : 'minutes'}`]),
  ];
  return parts.join(' ');
}
