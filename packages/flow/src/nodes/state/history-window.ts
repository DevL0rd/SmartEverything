import { z } from 'zod';

export const HISTORY_POINT = z.strictObject({
  at: z.iso.datetime({ offset: true }),
  value: z.json(),
});
export type HistoryPoint = z.infer<typeof HISTORY_POINT>;

export const HISTORY_REQUEST = z.strictObject({
  points: z.array(HISTORY_POINT),
  from: z.number(),
  to: z.number(),
  stateEquals: z.json().optional(),
});
export type HistoryRequest = z.input<typeof HISTORY_REQUEST>;

export interface HistoryWindow {
  readonly points: readonly HistoryPoint[];
  readonly average?: number;
  readonly min?: number;
  readonly max?: number;
  readonly change?: number;
  readonly count: number;
  readonly timeInMs?: number;
}

interface Stamped {
  readonly at: number;
  readonly point: HistoryPoint;
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function numeric(points: readonly HistoryPoint[]): number[] {
  return points.flatMap((point) => (typeof point.value === 'number' ? [point.value] : []));
}

function statistics(points: readonly HistoryPoint[]): Omit<HistoryWindow, 'points' | 'count'> {
  const numbers = numeric(points);
  const first = numbers[0];
  const last = numbers.at(-1);
  if (first === undefined || last === undefined) return {};
  return {
    average: numbers.reduce((sum, item) => sum + item, 0) / numbers.length,
    min: Math.min(...numbers),
    max: Math.max(...numbers),
    change: last - first,
  };
}

function timeIn(stamped: readonly Stamped[], from: number, to: number, target: unknown): number {
  let total = 0;
  for (const [index, entry] of stamped.entries()) {
    const start = Math.max(entry.at, from);
    const end = Math.min(stamped[index + 1]?.at ?? to, to);
    if (sameValue(entry.point.value, target) && end > start) total += end - start;
  }
  return total;
}

function carriedFrom(stamped: readonly Stamped[], from: number): readonly Stamped[] {
  const inForce = stamped.findLast((entry) => entry.at < from);
  return inForce === undefined ? stamped : stamped.slice(stamped.indexOf(inForce));
}

export function historyWindow(input: HistoryRequest): HistoryWindow {
  const { points, from, to, stateEquals } = HISTORY_REQUEST.parse(input);
  const stamped = points
    .map((point) => ({ at: Date.parse(point.at), point }))
    .sort((left, right) => left.at - right.at);
  const inside = stamped.filter((entry) => entry.at >= from && entry.at <= to);
  const window = inside.map((entry) => entry.point);
  return {
    points: window,
    ...statistics(window),
    count: window.length,
    ...(stateEquals === undefined
      ? {}
      : { timeInMs: timeIn(carriedFrom(stamped, from), from, to, stateEquals) }),
  };
}
