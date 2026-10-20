import { describe, expect, it } from 'vitest';
import { HOUR_MS } from '../../format/time';
import { isNarrowNight, labelFits, nightAt, nightTicks, nightWindow, nightX } from './night-axis';

function local(hour: number, minute = 0, day = 18): number {
  return new Date(2026, 9, day, hour, minute).getTime();
}

describe('night window', () => {
  it('spans the earliest to the latest time unless a bound is given', () => {
    expect(nightWindow([local(23), local(7, 0, 19), local(1, 0, 19)])).toEqual({
      from: local(23),
      to: local(7, 0, 19),
    });
    expect(nightWindow([local(23), local(7, 0, 19)], { from: local(22) })).toEqual({
      from: local(22),
      to: local(7, 0, 19),
    });
  });

  it('has no window without times or bounds', () => {
    expect(nightWindow([])).toBeNull();
  });
});

describe('night frame', () => {
  const frame = { window: { from: 1000, to: 2000 }, left: 44, right: 344 };

  it('maps time to x and back, clamping outside the plot', () => {
    expect(nightX(frame, 1000)).toBe(44);
    expect(nightX(frame, 1500)).toBe(194);
    expect(nightX(frame, 2000)).toBe(344);
    expect(nightAt(frame, 194)).toBe(1500);
    expect(nightAt(frame, 0)).toBe(1000);
    expect(nightAt(frame, 999)).toBe(2000);
  });
});

describe('night ticks', () => {
  it('puts a tick on every whole local hour inside the night', () => {
    const ticks = nightTicks({ from: local(23, 9), to: local(7, 26, 19) }, false);
    expect(ticks.map((tick) => new Date(tick.at).getMinutes())).toEqual(Array(8).fill(0));
    expect(ticks[0]?.at).toBe(local(0, 0, 19));
    expect(ticks.every((tick) => tick.kind !== 'half')).toBe(true);
    expect(ticks.every((tick) => tick.label !== null)).toBe(true);
  });

  it('labels every second hour on a narrow plot and keeps the odd hour as a mark', () => {
    const ticks = nightTicks({ from: local(23, 9), to: local(7, 26, 19) }, true);
    const labelled = ticks.filter((tick) => tick.kind === 'labelled');
    expect(labelled.map((tick) => new Date(tick.at).getHours())).toEqual([0, 2, 4, 6]);
    expect(ticks.filter((tick) => tick.kind === 'hour').map((tick) => tick.label)).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  it('labels every hour of a night under four hours even on a narrow plot', () => {
    const ticks = nightTicks({ from: local(1, 10), to: local(4, 5) }, true);
    const hours = ticks.filter((tick) => tick.kind === 'labelled');
    expect(hours.map((tick) => new Date(tick.at).getHours())).toEqual([2, 3, 4]);
  });

  it('labels every second hour on a night longer than nine hours', () => {
    const ticks = nightTicks({ from: local(21), to: local(8, 30, 19) }, false);
    const labelled = ticks.filter((tick) => tick.kind === 'labelled');
    expect(labelled.every((tick) => new Date(tick.at).getHours() % 2 === 0)).toBe(true);
    expect(ticks.length).toBeGreaterThan(labelled.length);
  });

  it('adds faint half-hour guides on a night under four hours', () => {
    const ticks = nightTicks({ from: local(1, 10), to: local(4, 5) }, false);
    const halves = ticks.filter((tick) => tick.kind === 'half');
    expect(halves.map((tick) => tick.at)).toEqual([local(1, 30), local(2, 30), local(3, 30)]);
    expect(ticks.filter((tick) => tick.kind === 'labelled')).toHaveLength(3);
  });

  it('has no ticks for an empty or inverted window', () => {
    expect(nightTicks({ from: local(5), to: local(5) }, false)).toEqual([]);
    expect(nightTicks({ from: local(6), to: local(5) }, false)).toEqual([]);
  });

  it('never ticks at the very start of the window', () => {
    const ticks = nightTicks({ from: local(23), to: local(23) + 3 * HOUR_MS }, false);
    expect(ticks.every((tick) => tick.at > local(23))).toBe(true);
  });
});

describe('plot fit rules', () => {
  it('calls a plot under 360 px narrow', () => {
    expect(isNarrowNight(296)).toBe(true);
    expect(isNarrowNight(360)).toBe(false);
  });

  it('keeps tick labels inside the chart width', () => {
    expect(labelFits(10, 400)).toBe(false);
    expect(labelFits(100, 400)).toBe(true);
    expect(labelFits(390, 400)).toBe(false);
  });
});
