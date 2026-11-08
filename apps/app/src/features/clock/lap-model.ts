import type {
  PlannerLap,
  PlannerRingRow,
  PlannerStats,
  PlannerStopwatchRow,
  PlannerTimerRow,
} from '@smarteverything/domain';
import { twoDigits } from '../../format/number';
import { compareText } from '../../format/text';
import { HOUR_MS, MINUTE_MS, duration } from '../../format/time';
import {
  bucketLabel,
  chunksFromEnd,
  loadStepOf,
  rangeDaysOf,
} from '../planner/insights/insights-model';

const SECOND_MS = 1000;
const CENTI_MS = 10;
const UNNAMED = 'Timer';

export interface TickSource {
  readonly base: number;
  readonly since: number | null;
  readonly rate: 1 | -1;
  readonly roundUp: boolean;
}

export function tickValueAt(source: TickSource, now: number): number {
  'worklet';
  const raw =
    source.since === null ? source.base : source.base + source.rate * (now - source.since);
  const clamped = Math.max(0, raw);
  return source.roundUp ? Math.ceil(clamped / SECOND_MS) * SECOND_MS : clamped;
}

export function digitAt(ms: number, unit: number, base: number): number {
  'worklet';
  return Math.floor(ms / unit) % base;
}

export function stopwatchSourceOf(stopwatch: PlannerStopwatchRow | null): TickSource {
  if (stopwatch === null) return { base: 0, since: null, rate: 1, roundUp: false };
  const since = stopwatch.started_at === null ? null : Date.parse(stopwatch.started_at);
  return { base: stopwatch.accumulated_ms, since, rate: 1, roundUp: false };
}

export function currentLapSourceOf(stopwatch: PlannerStopwatchRow | null): TickSource {
  const whole = stopwatchSourceOf(stopwatch);
  const last = stopwatch?.laps.at(-1)?.elapsed_ms ?? 0;
  return { ...whole, base: whole.base - last };
}

export function timerSourceOf(timer: PlannerTimerRow): TickSource {
  if (timer.state === 'running' && timer.ends_at !== null) {
    return { base: Date.parse(timer.ends_at), since: 0, rate: -1, roundUp: true };
  }
  return { base: timer.remaining_ms ?? 0, since: null, rate: -1, roundUp: true };
}

export type FacePlace =
  | { readonly kind: 'digit'; readonly key: string; readonly unit: number; readonly base: number }
  | { readonly kind: 'mark'; readonly key: string; readonly text: string };

export function hourDigitsOf(ms: number): number {
  const hours = Math.floor(ms / HOUR_MS);
  return hours === 0 ? 0 : String(hours).length;
}

function digit(key: string, unit: number, base: number): FacePlace {
  return { kind: 'digit', key, unit, base };
}

function hourPlaces(count: number): readonly FacePlace[] {
  if (count === 0) return [];
  const digits = Array.from({ length: count }, (_, index) =>
    digit(`h${String(index)}`, HOUR_MS * 10 ** (count - 1 - index), 10),
  );
  return [...digits, { kind: 'mark', key: 'hm', text: ':' }];
}

export function facePlacesOf(hourDigits: number, hundredths: boolean): readonly FacePlace[] {
  const clock: readonly FacePlace[] = [
    ...hourPlaces(hourDigits),
    digit('m0', 10 * MINUTE_MS, 6),
    digit('m1', MINUTE_MS, 10),
    { kind: 'mark', key: 'ms', text: ':' },
    digit('s0', 10 * SECOND_MS, 6),
    digit('s1', SECOND_MS, 10),
  ];
  if (!hundredths) return clock;
  return [
    ...clock,
    { kind: 'mark', key: 'sc', text: '.' },
    digit('c0', 100, 10),
    digit('c1', 10, 10),
  ];
}

export function lapTime(ms: number): string {
  const centis = Math.floor(Math.max(0, ms) / CENTI_MS);
  const hours = Math.floor(centis / 360_000);
  const minutes = Math.floor((centis % 360_000) / 6000);
  const seconds = `${twoDigits(Math.floor((centis % 6000) / 100))}.${twoDigits(centis % 100)}`;
  return hours > 0
    ? `${String(hours)}:${twoDigits(minutes)}:${seconds}`
    : `${String(minutes)}:${seconds}`;
}

export function deltaText(ms: number): string {
  const size = Math.abs(ms);
  const shown = size < MINUTE_MS ? (Math.floor(size / CENTI_MS) / 100).toFixed(2) : lapTime(size);
  if (Math.floor(size / CENTI_MS) === 0) return shown;
  return `${ms > 0 ? '+' : '-'}${shown}`;
}

export function deltaToneOf(delta: number | null): 'positive' | 'critical' | 'variant' {
  if (delta === null || Math.floor(Math.abs(delta) / CENTI_MS) === 0) return 'variant';
  return delta < 0 ? 'positive' : 'critical';
}

export type LapMark = 'best' | 'slowest' | null;

export interface LapRow {
  readonly number: number;
  readonly split: number;
  readonly delta: number | null;
  readonly total: number;
  readonly mark: LapMark;
}

export interface LapExtremes {
  readonly best: number;
  readonly slowest: number;
}

export function lapExtremesOf(laps: readonly PlannerLap[]): LapExtremes | null {
  const [first] = laps;
  if (first === undefined || laps.length < 2) return null;
  let best = 0;
  let slowest = 0;
  laps.forEach((lap, index) => {
    if (lap.split_ms < (laps[best]?.split_ms ?? first.split_ms)) best = index;
    if (lap.split_ms > (laps[slowest]?.split_ms ?? first.split_ms)) slowest = index;
  });
  return best === slowest ? null : { best, slowest };
}

export function lapMarkOf(index: number, extremes: LapExtremes | null): LapMark {
  if (extremes === null) return null;
  if (index === extremes.best) return 'best';
  return index === extremes.slowest ? 'slowest' : null;
}

export function lapRowsOf(laps: readonly PlannerLap[]): readonly LapRow[] {
  const extremes = lapExtremesOf(laps);
  return laps
    .map((lap, index) => {
      const previous = laps[index - 1];
      return {
        number: index + 1,
        split: lap.split_ms,
        delta: previous === undefined ? null : lap.split_ms - previous.split_ms,
        total: lap.elapsed_ms,
        mark: lapMarkOf(index, extremes),
      };
    })
    .reverse();
}

export function averageSplitOf(laps: readonly PlannerLap[]): number | null {
  if (laps.length === 0) return null;
  return laps.reduce((sum, lap) => sum + lap.split_ms, 0) / laps.length;
}

export function lapFloorOf(laps: readonly PlannerLap[]): number {
  if (laps.length === 0) return 0;
  const splits = laps.map((lap) => lap.split_ms);
  const low = Math.min(...splits);
  const high = Math.max(...splits);
  return Math.max(0, low - (high - low));
}

export function bestLapOf(laps: readonly PlannerLap[]): PlannerLap | null {
  return laps.reduce<PlannerLap | null>(
    (best, lap) => (best === null || lap.split_ms < best.split_ms ? lap : best),
    null,
  );
}

export type TimerPhase = 'ringing' | 'running' | 'paused';

export interface TimerView {
  readonly timer: PlannerTimerRow;
  readonly phase: TimerPhase;
  readonly ring: PlannerRingRow | null;
}

export function openRingsOf(rings: readonly PlannerRingRow[]): ReadonlyMap<string, PlannerRingRow> {
  return new Map(
    rings
      .filter(
        (ring) => ring.kind === 'timer' && ring.outcome === 'rang' && ring.dismissed_at === null,
      )
      .map((ring) => [ring.ref_id, ring] as const),
  );
}

export interface RingWindow {
  readonly from: string;
  readonly to: string;
}

export function ringWindowOf(timers: readonly PlannerTimerRow[]): RingWindow | null {
  const done = timers.filter((timer) => timer.state === 'done');
  if (done.length === 0) return null;
  const from = Math.min(...done.map((timer) => Date.parse(timer.created_at)));
  const to = Math.max(...done.map((timer) => Date.parse(timer.updated_at))) + 1;
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
}

function phaseOf(
  timer: PlannerTimerRow,
  open: ReadonlyMap<string, PlannerRingRow>,
): TimerPhase | null {
  if (timer.state === 'running') return 'running';
  if (timer.state === 'paused') return 'paused';
  return timer.state === 'done' && open.has(timer.id) ? 'ringing' : null;
}

const PHASE_ORDER: Readonly<Record<TimerPhase, number>> = { ringing: 0, running: 1, paused: 2 };

function orderKey(view: TimerView): number {
  if (view.phase === 'running') return Date.parse(view.timer.ends_at ?? '');
  return -Date.parse(view.timer.updated_at);
}

export function timerViewsOf(
  timers: readonly PlannerTimerRow[],
  rings: readonly PlannerRingRow[],
): readonly TimerView[] {
  const open = openRingsOf(rings);
  return timers
    .flatMap((timer): TimerView[] => {
      const phase = phaseOf(timer, open);
      return phase === null ? [] : [{ timer, phase, ring: open.get(timer.id) ?? null }];
    })
    .sort(
      (left, right) =>
        PHASE_ORDER[left.phase] - PHASE_ORDER[right.phase] || orderKey(left) - orderKey(right),
    );
}

export function timerNameOf(timer: PlannerTimerRow): string {
  return timer.label ?? UNNAMED;
}

export function lengthText(ms: number): string {
  return duration(Math.round(ms / SECOND_MS));
}

export function timersSubtitleOf(views: readonly TimerView[]): string {
  const counts = (['running', 'paused', 'ringing'] as const).flatMap((phase) => {
    const count = views.filter((view) => view.phase === phase).length;
    return count === 0 ? [] : [`${String(count)} ${phase}`];
  });
  return counts.length === 0 ? 'No timers running' : counts.join(' · ');
}

export interface TimerPreset {
  readonly key: string;
  readonly label: string;
  readonly ms: number;
  readonly name: string | null;
}

export const STARTING_PRESET: TimerPreset = {
  key: '10',
  label: '10 min',
  ms: 10 * MINUTE_MS,
  name: null,
};

export const TIMER_PRESETS: readonly TimerPreset[] = [
  { key: '1', label: '1 min', ms: MINUTE_MS, name: null },
  { key: '3', label: '3 min', ms: 3 * MINUTE_MS, name: null },
  STARTING_PRESET,
  { key: '25', label: '25 min focus', ms: 25 * MINUTE_MS, name: 'Focus' },
];

export interface TimerUseBucket {
  readonly key: string;
  readonly label: string;
  readonly ms: number;
}

export function timerUseBucketsOf(stats: PlannerStats): readonly TimerUseBucket[] {
  const step = loadStepOf(stats.range);
  const byDay = new Map<string, number>();
  for (const entry of stats.timer_use) {
    byDay.set(entry.day, (byDay.get(entry.day) ?? 0) + entry.total_ms);
  }
  return chunksFromEnd(rangeDaysOf(stats), step).flatMap((chunk) => {
    const [first] = chunk;
    if (first === undefined) return [];
    const ms = chunk.reduce((sum, day) => sum + (byDay.get(day) ?? 0), 0);
    return [{ key: first, label: bucketLabel(first, step), ms }];
  });
}

export interface TimerUseLabel {
  readonly label: string;
  readonly ms: number;
  readonly share: number;
}

export function timerUseLabelsOf(stats: PlannerStats): readonly TimerUseLabel[] {
  const byLabel = new Map<string, number>();
  for (const entry of stats.timer_use) {
    const label = entry.label ?? UNNAMED;
    byLabel.set(label, (byLabel.get(label) ?? 0) + entry.total_ms);
  }
  const total = [...byLabel.values()].reduce((sum, ms) => sum + ms, 0);
  return [...byLabel.entries()]
    .map(([label, ms]) => ({ label, ms, share: total === 0 ? 0 : ms / total }))
    .sort((left, right) => right.ms - left.ms || compareText(left.label, right.label));
}

export function timedText(ms: number): string {
  const minutes = Math.round(ms / MINUTE_MS);
  return minutes === 0 ? '0 min' : duration(minutes * 60);
}
