import { background } from '@smarteverything/logging';
import {
  PHONE_CONTEXT_STATE,
  PHONE_CONTEXT_STATES,
  type HistoryRow,
  type PhoneContextState,
} from '@smarteverything/domain';
import type { ChartPoint, TimelineSegment } from '../../../components/charts';
import { MINUTE_MS, dayKeyOf, shiftDay, startOfDayKey } from '../../../format/time';
import { readDeviceRows, useDeviceSeries } from '../../../queries/history';
import { deviceHistoryKey } from '../../../queries/keys';
import { useScreenQuery } from '../../../queries/use-screen-query';

export type PhoneDoingState = Exclude<PhoneContextState, 'unknown'>;

export type PhoneDoingSegment = TimelineSegment<PhoneDoingState>;

export const BATTERY_RANGES = ['24h', '7d'] as const;

export type BatteryRange = (typeof BATTERY_RANGES)[number];

const BATTERY_RANGE_HOURS: Readonly<Record<BatteryRange, number>> = { '24h': 24, '7d': 168 };

export const DOING_DAYS = 7;

const DOING_HOURS = DOING_DAYS * 24;

export interface TimeSpan {
  readonly start: number;
  readonly end: number;
}

export interface DoingDay {
  readonly dayStart: number;
  readonly minutes: Readonly<Record<PhoneDoingState, number>>;
}

function isDoing(state: PhoneContextState): state is PhoneDoingState {
  return state !== 'unknown';
}

const DOING_STATES = PHONE_CONTEXT_STATES.filter(isDoing);

const NO_MINUTES: Readonly<Record<PhoneDoingState, number>> = {
  still: 0,
  walking: 0,
  running: 0,
  cycling: 0,
  driving: 0,
  navigating: 0,
  parked: 0,
};

function momentOf(row: HistoryRow): number {
  return Date.parse(row.observed_at);
}

export function chargingSpansOf(rows: readonly HistoryRow[], now: number): readonly TimeSpan[] {
  const spans: TimeSpan[] = [];
  let since: number | null = null;
  for (const row of rows) {
    const at = momentOf(row);
    if (row.value === true && since === null) since = at;
    if (row.value === false && since !== null) {
      spans.push({ start: since, end: at });
      since = null;
    }
  }
  return since === null || since >= now ? spans : [...spans, { start: since, end: now }];
}

function stateOf(row: HistoryRow): PhoneDoingState | null {
  const state = PHONE_CONTEXT_STATE.safeParse(row.value);
  return state.success && state.data !== 'unknown' ? state.data : null;
}

function joined(
  segments: readonly PhoneDoingSegment[],
  next: PhoneDoingSegment,
): readonly PhoneDoingSegment[] {
  const last = segments.at(-1);
  const continues = last?.state === next.state && last.end === next.start;
  return continues ? [...segments.slice(0, -1), { ...last, end: next.end }] : [...segments, next];
}

export function doingSegmentsOf(
  rows: readonly HistoryRow[],
  now: number,
): readonly PhoneDoingSegment[] {
  let segments: readonly PhoneDoingSegment[] = [];
  rows.forEach((row, index) => {
    const state = stateOf(row);
    const next = rows[index + 1];
    const end = next === undefined ? now : momentOf(next);
    const start = momentOf(row);
    if (state !== null && end > start) segments = joined(segments, { start, end, state });
  });
  return segments;
}

export function clipSegments(
  segments: readonly PhoneDoingSegment[],
  from: number,
): readonly PhoneDoingSegment[] {
  return segments.flatMap((segment) =>
    segment.end <= from ? [] : [{ ...segment, start: Math.max(segment.start, from) }],
  );
}

export function doingToday(
  segments: readonly PhoneDoingSegment[],
  now: number,
): readonly PhoneDoingSegment[] {
  return clipSegments(segments, startOfDayKey(dayKeyOf(now)));
}

function overlapMinutes(segment: PhoneDoingSegment, from: number, to: number): number {
  return Math.max(0, Math.min(segment.end, to) - Math.max(segment.start, from)) / MINUTE_MS;
}

function dayOf(segments: readonly PhoneDoingSegment[], from: number, to: number): DoingDay {
  const minutes = { ...NO_MINUTES };
  for (const segment of segments) minutes[segment.state] += overlapMinutes(segment, from, to);
  for (const state of DOING_STATES) minutes[state] = Math.round(minutes[state]);
  return { dayStart: from, minutes };
}

export function doingMinutesByDay(
  segments: readonly PhoneDoingSegment[],
  days: number,
  now: number,
): readonly DoingDay[] {
  const today = dayKeyOf(now);
  return Array.from({ length: days }, (_, index) => {
    const day = shiftDay(today, index + 1 - days);
    return dayOf(segments, startOfDayKey(day), startOfDayKey(shiftDay(day, 1)));
  });
}

export interface PhoneBattery {
  readonly points: readonly ChartPoint[] | undefined;
  readonly charging: readonly TimeSpan[] | undefined;
  readonly error: Error | null;
  readonly retry: () => void;
}

export function usePhoneBattery(
  deviceId: string,
  range: BatteryRange,
  now: number,
  enabled = true,
): PhoneBattery {
  const hours = BATTERY_RANGE_HOURS[range];
  const points = useDeviceSeries(deviceId, 'battery', hours, enabled);
  const charging = useScreenQuery({
    queryKey: deviceHistoryKey(deviceId, 'charging', hours),
    queryFn: () => readDeviceRows(deviceId, 'charging', hours),
    select: (rows) => chargingSpansOf(rows, now),
    enabled,
  });
  return {
    points: points.data,
    charging: charging.data,
    error: points.error ?? charging.error,
    retry: (): void => {
      background(points.refetch(), 'phone_history.refetch_failed');
      background(charging.refetch(), 'phone_history.refetch_failed');
    },
  };
}

export interface PhoneDoing {
  readonly segments: readonly PhoneDoingSegment[] | undefined;
  readonly error: Error | null;
  readonly retry: () => void;
}

export function usePhoneDoing(deviceId: string, now: number, enabled = true): PhoneDoing {
  const query = useScreenQuery({
    queryKey: deviceHistoryKey(deviceId, 'phone_context', DOING_HOURS),
    queryFn: () => readDeviceRows(deviceId, 'phone_context', DOING_HOURS),
    select: (rows) => doingSegmentsOf(rows, now),
    enabled,
  });
  return {
    segments: query.data,
    error: query.error,
    retry: (): void => {
      background(query.refetch(), 'phone_history.refetch_failed');
    },
  };
}
