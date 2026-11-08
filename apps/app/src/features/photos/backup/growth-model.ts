import { DAY_MS, startOfDayKey } from '../../../format/time';

const DAYS_PER_MONTH = 365.25 / 12;

export const PROJECTION_SHARE = 0.18;

export interface GrowthDay {
  readonly day: string;
  readonly bytes: number;
}

export interface GrowthShape {
  readonly area: string;
  readonly line: string;
  readonly projection: string | null;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

function pathOf(points: readonly Point[]): string {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ');
}

interface Frame {
  readonly start: number;
  readonly span: number;
  readonly low: number;
  readonly range: number;
  readonly width: number;
  readonly height: number;
}

function place(frame: Frame, at: number, bytes: number): Point {
  return {
    x: ((at - frame.start) / frame.span) * frame.width,
    y: frame.height - ((bytes - frame.low) / frame.range) * frame.height,
  };
}

interface Ends {
  readonly start: number;
  readonly end: number;
  readonly last: GrowthDay;
}

function endsOf(days: readonly GrowthDay[]): Ends | null {
  const first = days[0];
  const last = days.at(-1);
  if (first === undefined || last === undefined) return null;
  const start = startOfDayKey(first.day);
  const end = startOfDayKey(last.day);
  return end > start ? { start, end, last } : null;
}

function aheadOf(
  ends: Ends,
  perMonth: number | null,
): { readonly ms: number; readonly bytes: number } {
  if (perMonth === null || perMonth <= 0) return { ms: 0, bytes: ends.last.bytes };
  const ms = ((ends.end - ends.start) * PROJECTION_SHARE) / (1 - PROJECTION_SHARE);
  return { ms, bytes: ends.last.bytes + (perMonth * ms) / (DAY_MS * DAYS_PER_MONTH) };
}

export function growthShapeOf(
  days: readonly GrowthDay[],
  perMonth: number | null,
  width: number,
  height: number,
): GrowthShape | null {
  const ends = width > 0 ? endsOf(days) : null;
  if (ends === null) return null;
  const ahead = aheadOf(ends, perMonth);
  const values = days.map((day) => day.bytes);
  const low = Math.min(...values);
  const range = Math.max(ahead.bytes, ...values) - low;
  const frame: Frame = {
    start: ends.start,
    span: ends.end + ahead.ms - ends.start,
    low,
    range: range === 0 ? 1 : range,
    width,
    height,
  };
  const line = pathOf(days.map((day) => place(frame, startOfDayKey(day.day), day.bytes)));
  const tail = place(frame, ends.end, ends.last.bytes);
  return {
    line,
    area: `${line} L${tail.x.toFixed(1)} ${String(height)} L0 ${String(height)} Z`,
    projection:
      ahead.ms === 0 ? null : pathOf([tail, place(frame, ends.end + ahead.ms, ahead.bytes)]),
  };
}
