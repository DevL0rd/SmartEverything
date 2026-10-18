import { describe, expect, it } from 'vitest';
import type { HistoryBucket, HistoryRow, JsonValue } from '@smarteverything/domain';
import { DAY_MS, HOUR_MS } from '../../../format/time';
import {
  bucketChanges,
  cellOpacity,
  changesByDevice,
  dayCells,
  flipsOf,
  hasHistory,
  laneOf,
  laneSummary,
  spokenTotal,
  startsUnknown,
  stateBefore,
  totalText,
  windowAt,
  withFlips,
} from './lanes';

const NOW = Date.parse('2026-10-18T12:00:00.000Z');
const WINDOW = windowAt('day', NOW);

function at(hoursAgo: number): number {
  return NOW - hoursAgo * HOUR_MS;
}

function row(deviceId: string, hoursAgo: number, value: boolean, capability = 'power'): HistoryRow {
  return {
    id: 1,
    device_id: deviceId,
    capability,
    value,
    observed_at: new Date(at(hoursAgo)).toISOString(),
  };
}

describe('laneOf', () => {
  it('turns on and off changes into lit spans and a total', () => {
    const lane = laneOf(
      [
        { at: at(10), on: true },
        { at: at(6), on: false },
        { at: at(2), on: true },
      ],
      undefined,
      WINDOW,
    );
    expect(lane.spans).toStrictEqual([
      { start: at(10), end: at(6) },
      { start: at(2), end: NOW },
    ]);
    expect(lane.onMs).toBe(6 * HOUR_MS);
    expect(lane.knownFrom).toBe(at(10));
  });

  it('starts from the state before the window when that is known', () => {
    const lane = laneOf([{ at: at(20), on: false }], true, WINDOW);
    expect(lane.spans).toStrictEqual([{ start: WINDOW.from, end: at(20) }]);
    expect(lane.knownFrom).toBe(WINDOW.from);
  });

  it('knows nothing before the first change when there is no earlier state', () => {
    const lane = laneOf([{ at: at(20), on: false }], undefined, WINDOW);
    expect(lane.spans).toStrictEqual([]);
    expect(lane.onMs).toBe(0);
    expect(lane.knownFrom).toBe(at(20));
    expect(startsUnknown(lane, WINDOW)).toBe(true);
    expect(hasHistory(lane, WINDOW)).toBe(true);
  });

  it('does not invent on time for a light that is lit now but has no history', () => {
    const lane = laneOf([], undefined, WINDOW);
    expect(lane.spans).toStrictEqual([]);
    expect(lane.onMs).toBe(0);
    expect(lane.knownFrom).toBe(WINDOW.to);
    expect(hasHistory(lane, WINDOW)).toBe(false);
  });

  it('fills the whole window when the state before it was on and nothing changed', () => {
    const lane = laneOf([], true, WINDOW);
    expect(lane.onMs).toBe(24 * HOUR_MS);
    expect(laneOf([], false, WINDOW).spans).toStrictEqual([]);
    expect(startsUnknown(lane, WINDOW)).toBe(false);
  });

  it('ignores repeated values and changes outside the window', () => {
    const lane = laneOf(
      [
        { at: at(30), on: true },
        { at: at(5), on: true },
        { at: at(3), on: false },
      ],
      true,
      WINDOW,
    );
    expect(lane.spans).toStrictEqual([{ start: WINDOW.from, end: at(3) }]);
  });
});

describe('week buckets', () => {
  const key = (): string => 'power';
  const bucket = (hoursAgo: number, last: JsonValue, deviceId = 'a'): HistoryBucket => ({
    device_id: deviceId,
    capability: 'power',
    bucket_start: new Date(at(hoursAgo)).toISOString(),
    count: 1,
    average: null,
    minimum: null,
    maximum: null,
    last,
  });

  it('puts each bucket change in the middle of its hour', () => {
    const changes = bucketChanges([bucket(5, true), bucket(3, false)], key, at(24));
    expect(changes.get('a')).toStrictEqual([
      { at: at(5) + HOUR_MS / 2, on: true },
      { at: at(3) + HOUR_MS / 2, on: false },
    ]);
  });

  it('keeps earlier buckets out of the changes and takes the latest of them as the state before', () => {
    const rows = [bucket(60, false), bucket(30, true), bucket(5, false)];
    expect(bucketChanges(rows, key, at(24)).get('a')?.length).toBe(1);
    expect(stateBefore(rows, key, at(24)).get('a')).toBe(true);
  });

  it('skips buckets that are not power switches or belong to another capability', () => {
    const rows = [bucket(5, 40), { ...bucket(4, true), capability: 'brightness' }];
    expect(bucketChanges(rows, key, at(24)).size).toBe(0);
    expect(stateBefore(rows, key, at(5)).size).toBe(0);
  });
});

describe('live flips', () => {
  it('records the first sight silently and a flip afterwards', () => {
    const first = flipsOf(new Map(), { a: 'on', b: 'off' }, NOW);
    expect(first.flips).toStrictEqual([]);
    const second = flipsOf(first.known, { a: 'off', b: 'off' }, NOW + 1000);
    expect(second.flips).toStrictEqual([{ deviceId: 'a', at: NOW + 1000, on: false }]);
  });

  it('does not turn going offline or coming back into a flip', () => {
    const first = flipsOf(new Map(), { a: 'on' }, NOW);
    const offline = flipsOf(first.known, { a: 'offline' }, NOW + 1000);
    expect(offline.flips).toStrictEqual([]);
    expect(flipsOf(offline.known, { a: 'on' }, NOW + 2000).flips).toStrictEqual([]);
  });

  it('adds flips to the history lanes already hold', () => {
    const base = new Map([['a', [{ at: at(5), on: true }]]]);
    const merged = withFlips(base, [{ deviceId: 'a', at: NOW, on: false }]);
    expect(merged.get('a')).toStrictEqual([
      { at: at(5), on: true },
      { at: NOW, on: false },
    ]);
    expect(withFlips(base, [])).toBe(base);
  });
});

describe('lane summary', () => {
  const lit = laneOf([{ at: at(5), on: true }], undefined, WINDOW);

  it('says how long a light was on, in words for a screen reader too', () => {
    expect(laneSummary(lit, WINDOW, false, 'day')).toStrictEqual({
      text: 'On 5h 00m',
      spoken: 'on 5 hours today',
    });
  });

  it('says off today instead of on 0 minutes', () => {
    const off = laneOf([], false, WINDOW);
    expect(laneSummary(off, WINDOW, false, 'week').text).toBe('Off this week');
  });

  it('keeps the on time of an offline light and says it is offline now', () => {
    expect(laneSummary(lit, WINDOW, true, 'day').text).toBe('On 5h 00m · offline now');
    expect(laneSummary(laneOf([], false, WINDOW), WINDOW, true, 'day').text).toBe(
      'Off today · offline now',
    );
  });

  it('says there is no history yet when nothing was ever seen', () => {
    expect(laneSummary(laneOf([], undefined, WINDOW), WINDOW, false, 'day').text).toBe(
      'No history yet',
    );
  });
});

describe('changesByDevice', () => {
  it('keeps only the power rows of each device, in time order', () => {
    const rows = [row('a', 1, true), row('a', 3, false), row('a', 2, true, 'brightness')];
    const map = changesByDevice(rows, () => 'power');
    expect(map.get('a')?.map((change) => change.on)).toStrictEqual([false, true]);
  });

  it('skips devices without a power key', () => {
    expect(changesByDevice([row('a', 1, true)], () => undefined).size).toBe(0);
  });
});

describe('week cells', () => {
  it('splits lit time into equal cells of the window', () => {
    const window = windowAt('week', NOW);
    const lane = laneOf([{ at: window.to - 3 * HOUR_MS, on: true }], false, window);
    const cells = dayCells(lane, window, 7);
    expect(cells.slice(0, 6).map((cell) => cell.ms)).toStrictEqual([0, 0, 0, 0, 0, 0]);
    expect(cells[6]?.ms).toBe(3 * HOUR_MS);
  });

  it('marks the cells before the first known change as unknown', () => {
    const window = windowAt('week', NOW);
    const lane = laneOf([{ at: window.to - 2 * DAY_MS, on: true }], undefined, window);
    expect(dayCells(lane, window, 7).map((cell) => cell.known)).toStrictEqual([
      false,
      false,
      false,
      false,
      false,
      true,
      true,
    ]);
  });

  it('maps lit time to four opacity steps', () => {
    expect(cellOpacity(0)).toBe(0);
    expect(cellOpacity(HOUR_MS)).toBe(0.35);
    expect(cellOpacity(5 * HOUR_MS)).toBe(0.55);
    expect(cellOpacity(10 * HOUR_MS)).toBe(0.78);
    expect(cellOpacity(20 * HOUR_MS)).toBe(1);
  });
});

describe('lane totals', () => {
  it('writes the lit time short for the lane and in words for a screen reader', () => {
    expect(totalText(5 * HOUR_MS + 20 * 60_000)).toBe('5h 20m');
    expect(spokenTotal(5 * HOUR_MS + 20 * 60_000)).toBe('5 hours 20 minutes');
    expect(spokenTotal(2 * HOUR_MS)).toBe('2 hours');
    expect(spokenTotal(HOUR_MS + 60_000)).toBe('1 hour 1 minute');
    expect(spokenTotal(38 * 60_000)).toBe('38 minutes');
  });
});
