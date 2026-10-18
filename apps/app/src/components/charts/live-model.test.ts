import { describe, expect, it } from 'vitest';
import { liveModelOf, type Model } from './chart-model';

const NOW = 1_000_000;
const SPAN = 120_000;

function modelOf(
  points: { t: number; v: number }[],
  bare = false,
  formatValue?: (value: number) => string,
  domain = { min: 0, max: 100 },
): Model {
  return liveModelOf(
    {
      series: [{ label: 'CPU', colour: 'viz-blue', points }],
      window: { spanMs: SPAN, now: NOW },
      domain,
      unit: '%',
      formatValue,
      bare,
    },
    400,
    160,
  );
}

describe('liveModelOf', () => {
  it('widens the label gutter to the longest axis label and keeps the end of the line clear', () => {
    const narrow = modelOf([]);
    const wide = modelOf([], false, (value) => `${String(value)} MB/s`, { min: 0, max: 5 });
    expect(wide.box.left).toBeGreaterThan(narrow.box.left);
    expect(wide.box.left).toBeGreaterThanOrEqual('2.5 MB/s'.length * 7);
    expect(modelOf([]).box.bottom).toBeLessThan(160 - 20);
  });

  it('pins the newest moment to the right edge and the oldest to the left, whatever the data holds', () => {
    const model = modelOf([{ t: NOW - 1000, v: 10 }]);
    expect(model.x(NOW)).toBe(model.box.right);
    expect(model.x(NOW - SPAN)).toBe(model.box.left);
  });

  it('keeps three even gridlines of the domain', () => {
    expect(modelOf([]).yTicks).toEqual([0, 50, 100]);
  });

  it('drops points outside the window', () => {
    const model = modelOf([
      { t: NOW - SPAN - 5000, v: 90 },
      { t: NOW - 2000, v: 10 },
    ]);
    expect(model.drawn[0]?.points).toEqual([{ t: NOW - 2000, v: 10 }]);
  });

  it('breaks the line where the computer stopped reporting', () => {
    const model = modelOf([
      { t: NOW - 60_000, v: 10 },
      { t: NOW - 59_000, v: 11 },
      { t: NOW - 10_000, v: 12 },
      { t: NOW - 9_000, v: 13 },
    ]);
    expect(model.drawn[0]?.segments).toHaveLength(2);
  });

  it('uses the whole width for a bare chart, so a cell sparkline has no axis room', () => {
    const bare = modelOf([], true);
    const full = modelOf([]);
    expect(bare.box.left).toBeLessThan(full.box.left);
    expect(bare.box.right).toBeGreaterThan(full.box.right);
  });

  it('formats ticks with as many decimals as the step needs', () => {
    const model = liveModelOf(
      {
        series: [],
        window: { spanMs: SPAN, now: NOW },
        domain: { min: 0, max: 5 },
        unit: undefined,
        formatValue: undefined,
        bare: false,
      },
      400,
      160,
    );
    expect(model.format(2.5)).toBe('2.5');
  });
});
