import { describe, expect, it } from 'vitest';
import type { HistoryRow } from '@smarteverything/domain';
import { MINUTE_MS, dayKeyOf, startOfDayKey } from '../../../format/time';
import {
  chargingSpansOf,
  clipSegments,
  doingMinutesByDay,
  doingSegmentsOf,
  doingToday,
} from './phone-history';

const DEVICE = '00000000-0000-4000-8000-0000000000a1';
const NOON = new Date(2026, 9, 18, 12, 0, 0).getTime();

function row(id: number, at: number, value: HistoryRow['value']): HistoryRow {
  return {
    id,
    device_id: DEVICE,
    capability: 'phone_context',
    value,
    observed_at: new Date(at).toISOString(),
  };
}

function at(minutesBeforeNoon: number): number {
  return NOON - minutesBeforeNoon * MINUTE_MS;
}

describe('chargingSpansOf', () => {
  it('turns on and off changes into spans', () => {
    const rows = [row(1, at(300), true), row(2, at(200), false), row(3, at(100), true)];
    expect(chargingSpansOf(rows, NOON)).toEqual([
      { start: at(300), end: at(200) },
      { start: at(100), end: NOON },
    ]);
  });

  it('repeats of the same value do not split a span', () => {
    const rows = [row(1, at(300), true), row(2, at(250), true), row(3, at(200), false)];
    expect(chargingSpansOf(rows, NOON)).toEqual([{ start: at(300), end: at(200) }]);
  });

  it('has no span for a phone that was never charging in the range', () => {
    expect(chargingSpansOf([row(1, at(300), false)], NOON)).toEqual([]);
    expect(chargingSpansOf([], NOON)).toEqual([]);
  });
});

describe('doingSegmentsOf', () => {
  it('runs each state until the next change and the last one until now', () => {
    const rows = [row(1, at(180), 'still'), row(2, at(120), 'walking'), row(3, at(60), 'driving')];
    expect(doingSegmentsOf(rows, NOON)).toEqual([
      { start: at(180), end: at(120), state: 'still' },
      { start: at(120), end: at(60), state: 'walking' },
      { start: at(60), end: NOON, state: 'driving' },
    ]);
  });

  it('joins neighbours of the same state', () => {
    const rows = [row(1, at(120), 'still'), row(2, at(60), 'still')];
    expect(doingSegmentsOf(rows, NOON)).toEqual([{ start: at(120), end: NOON, state: 'still' }]);
  });

  it('leaves a gap for an unknown or unreadable state', () => {
    const rows = [
      row(1, at(180), 'walking'),
      row(2, at(120), 'unknown'),
      row(3, at(60), 'flying'),
      row(4, at(30), 'still'),
    ];
    expect(doingSegmentsOf(rows, NOON)).toEqual([
      { start: at(180), end: at(120), state: 'walking' },
      { start: at(30), end: NOON, state: 'still' },
    ]);
  });

  it('has nothing for no rows', () => {
    expect(doingSegmentsOf([], NOON)).toEqual([]);
  });
});

describe('clipSegments and doingToday', () => {
  const midnight = startOfDayKey(dayKeyOf(NOON));

  it('cuts a segment at the start and drops one that ended before it', () => {
    const segments = [
      { start: midnight - 600_000, end: midnight - 300_000, state: 'still' as const },
      { start: midnight - 100_000, end: NOON, state: 'walking' as const },
    ];
    expect(clipSegments(segments, midnight)).toEqual([
      { start: midnight, end: NOON, state: 'walking' },
    ]);
  });

  it('keeps today from midnight', () => {
    const segments = [{ start: midnight - 3_600_000, end: NOON, state: 'still' as const }];
    expect(doingToday(segments, NOON)).toEqual([{ start: midnight, end: NOON, state: 'still' }]);
  });
});

describe('doingMinutesByDay', () => {
  it('counts minutes per state on each of the last days, today last', () => {
    const midnight = startOfDayKey(dayKeyOf(NOON));
    const segments = [
      {
        start: midnight - 120 * MINUTE_MS,
        end: midnight + 30 * MINUTE_MS,
        state: 'driving' as const,
      },
      { start: midnight + 60 * MINUTE_MS, end: NOON, state: 'still' as const },
    ];
    const days = doingMinutesByDay(segments, 3, NOON);
    expect(days).toHaveLength(3);
    expect(days[2]?.dayStart).toBe(midnight);
    expect(days[2]?.minutes).toMatchObject({ driving: 30, still: 660, walking: 0 });
    expect(days[1]?.minutes).toMatchObject({ driving: 120, still: 0 });
    expect(days[0]?.minutes.driving).toBe(0);
  });
});
