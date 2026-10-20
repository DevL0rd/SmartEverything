import { describe, expect, it } from 'vitest';
import { MINUTE_MS } from '../../format/time';
import { nightX } from './night-axis';
import {
  TRACE_MAX_GAP_MS,
  cadenceOf,
  digitsOf,
  domainOf,
  formatterOf,
  gutterFormatterOf,
  gutterValuesOf,
  highestOf,
  linePathOf,
  lowestOf,
  pointsIn,
  readoutTextOf,
  ringedOf,
  runsOf,
  stepAt,
  summaryOf,
  traceFrameOf,
  valueAt,
  valueY,
  type TracePoint,
} from './night-trace-model';

const BED = new Date(2026, 9, 18, 23, 0).getTime();

function at(minutes: number): number {
  return BED + minutes * MINUTE_MS;
}

function point(minutes: number, value: number): TracePoint {
  return { at: at(minutes), value };
}

const HEART: readonly TracePoint[] = [
  point(0, 62),
  point(2, 58),
  point(4, 51),
  point(6, 48),
  point(8, 55),
  point(10, 48),
];

const FRAME = traceFrameOf({
  window: { from: at(0), to: at(480) },
  width: 348,
  height: 64,
  domain: { min: 40, max: 70 },
});

const PLAIN = (text: string): string => text.replace(/\s/g, ' ');

describe('domain', () => {
  it('pads the value range by a tenth on each side', () => {
    const domain = domainOf(HEART);
    expect(domain.min).toBeCloseTo(46.6);
    expect(domain.max).toBeCloseTo(63.4);
  });

  it('uses the given domain in either order', () => {
    expect(domainOf(HEART, [100, 85])).toEqual({ min: 85, max: 100 });
  });

  it('widens a flat series and handles no points', () => {
    const flat = domainOf([point(0, 14), point(1, 14)]);
    expect(flat.min).toBeCloseTo(12.6);
    expect(flat.max).toBeCloseTo(15.4);
    expect(domainOf([])).toEqual({ min: 0, max: 1 });
  });

  it('shows one decimal for narrow domains only', () => {
    expect(digitsOf({ min: -1, max: 1 })).toBe(1);
    expect(digitsOf({ min: 44, max: 72 })).toBe(0);
  });
});

describe('window', () => {
  it('keeps points inside the window in time order', () => {
    const shown = pointsIn([point(30, 1), point(-5, 2), point(10, 3), point(500, 4)], {
      from: at(0),
      to: at(480),
    });
    expect(shown.map((entry) => entry.value)).toEqual([3, 1]);
  });
});

describe('marked points', () => {
  it('finds the first lowest and the highest point', () => {
    expect(lowestOf(HEART)).toEqual(point(6, 48));
    expect(highestOf(HEART)).toEqual(point(0, 62));
    expect(lowestOf([])).toBeNull();
  });

  it('rings samples under a value', () => {
    const oxygen = [point(0, 96), point(10, 89), point(20, 90), point(30, 87)];
    expect(ringedOf(oxygen, 90).map((entry) => entry.value)).toEqual([89, 87]);
    expect(ringedOf(oxygen, 80)).toEqual([]);
  });
});

describe('value at a time', () => {
  it('returns the nearest sample within ten minutes', () => {
    expect(valueAt(HEART, at(5))).toEqual(point(4, 51));
    expect(valueAt(HEART, at(7.2))).toEqual(point(8, 55));
    expect(valueAt(HEART, at(-7))).toEqual(point(0, 62));
  });

  it('does not reach across a gap over ten minutes', () => {
    const holed = [point(0, 96), point(5, 95), point(10, 96), point(50, 95), point(55, 96)];
    expect(valueAt(holed, at(30))).toBeNull();
    expect(valueAt(holed, at(21))).toBeNull();
    expect(valueAt(holed, at(20))).toEqual(point(10, 96));
    expect(valueAt([], at(0))).toBeNull();
    expect(TRACE_MAX_GAP_MS).toBe(10 * MINUTE_MS);
  });

  it('reaches half the cadence of a slow series', () => {
    const slow = [point(0, 0.1), point(30, 0.2), point(60, 0.3)];
    expect(valueAt(slow, at(14))).toEqual(point(0, 0.1));
    expect(valueAt(slow, at(16))).toEqual(point(30, 0.2));
  });

  it('reads out the value or says there is no data', () => {
    const format = (value: number): string => `${String(value)}%`;
    expect(readoutTextOf(point(0, 96), format)).toBe('96%');
    expect(readoutTextOf(null, format)).toBe('No data');
  });
});

describe('line', () => {
  it('splits runs at gaps over ten minutes', () => {
    const runs = runsOf([point(0, 1), point(5, 2), point(16, 3), point(20, 4)]);
    expect(runs.map((run) => run.length)).toEqual([2, 2]);
    expect(runsOf([point(0, 1), point(10, 2)]).length).toBe(1);
  });

  it('keeps a slow series in one run', () => {
    const slow = [point(0, 0.1), point(15, 0.2), point(30, 0.3), point(45, 0.4)];
    expect(runsOf(slow).length).toBe(1);
    expect(cadenceOf(slow)).toBe(15 * MINUTE_MS);
    expect(runsOf([...slow, point(120, 0.5)]).length).toBe(2);
  });

  it('draws one move per run', () => {
    const path = linePathOf(
      [point(0, 55), point(5, 55), point(10, 55), point(60, 55), point(65, 55)],
      FRAME,
    );
    expect(path.match(/M/g)?.length).toBe(2);
    expect(path.startsWith(`M${String(nightX(FRAME, at(0)))}`)).toBe(true);
  });

  it('maps higher values higher up and clamps outside the domain', () => {
    expect(valueY(FRAME, 70)).toBe(FRAME.top);
    expect(valueY(FRAME, 40)).toBe(FRAME.bottom);
    expect(valueY(FRAME, 100)).toBe(FRAME.top);
    expect(valueY(FRAME, 55)).toBeCloseTo((FRAME.top + FRAME.bottom) / 2);
  });
});

describe('gutter', () => {
  it('labels the ends and a guide that is not near an edge', () => {
    expect(gutterValuesOf({ min: 85, max: 100 }, 90)).toEqual([100, 90, 85]);
    expect(gutterValuesOf({ min: 85, max: 100 }, 99)).toEqual([100, 85]);
    expect(gutterValuesOf({ min: 85, max: 100 }, undefined)).toEqual([100, 85]);
    expect(PLAIN(gutterFormatterOf({ min: 44, max: 72 })(71))).toBe('71');
    expect(PLAIN(gutterFormatterOf({ min: -1, max: 1 })(-1))).toBe('-1.0');
  });

  it('formats values with the unit', () => {
    const format = formatterOf({ min: 85, max: 100 }, '%');
    expect(PLAIN(format(96))).toBe('96%');
    expect(PLAIN(formatterOf({ min: 44, max: 72 }, 'bpm')(55))).toBe('55 bpm');
  });
});

describe('stepping and summary', () => {
  it('steps to the next and previous sample', () => {
    expect(stepAt(HEART, null, 1)).toBe(at(0));
    expect(stepAt(HEART, null, -1)).toBe(at(10));
    expect(stepAt(HEART, at(4), 1)).toBe(at(6));
    expect(stepAt(HEART, at(5), -1)).toBe(at(4));
    expect(stepAt(HEART, at(10), 1)).toBe(at(10));
    expect(stepAt(HEART, at(0), -1)).toBe(at(0));
    expect(stepAt([], null, 1)).toBeNull();
  });

  it('describes average, lowest and highest for a screen reader', () => {
    const text = summaryOf(HEART, 'Heart rate', (value) => `${String(Math.round(value))} bpm`);
    expect(PLAIN(text)).toMatch(
      /^Heart rate\. Average 54 bpm, lowest 48 bpm at 11:06 PM, highest 62 bpm at 11:00 PM\.$/,
    );
    expect(summaryOf([], 'Heart rate', String)).toBe('Heart rate: no data.');
  });
});
