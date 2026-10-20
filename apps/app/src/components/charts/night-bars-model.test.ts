import { describe, expect, it } from 'vitest';
import {
  AXIS_END,
  AXIS_START,
  axisMinute,
  axisShare,
  barsFrameOf,
  barWidthOf,
  clockTickLabel,
  clockTicks,
  columnAt,
  columnLabel,
  columnName,
  napMarkOf,
  nightShares,
  slotsOf,
  stepColumn,
  usualShares,
  windowReadout,
  windowSummary,
  type WindowColumn,
} from './night-bars-model';

const MONDAY = new Date(2026, 9, 19).getTime();
const DAY = 24 * 60 * 60_000;

function windowColumn(offset: number, column: Partial<WindowColumn> = {}): WindowColumn {
  return {
    key: `w${String(offset)}`,
    at: MONDAY + offset * DAY,
    night: { bed: 23 * 60 + 9, wake: 7 * 60 + 26, asleepMinutes: 477 },
    nap: null,
    ...column,
  };
}

describe('clock axis', () => {
  it('runs from 8 PM to 12 PM in two hour steps', () => {
    const ticks = clockTicks();
    expect(ticks[0]).toBe(AXIS_START);
    expect(ticks[ticks.length - 1]).toBe(AXIS_END);
    expect(ticks).toHaveLength(9);
    expect(clockTickLabel(AXIS_START)).toMatch(/^8\s?PM$/i);
    expect(clockTickLabel(AXIS_START + 240)).toMatch(/^12\s?AM$/i);
    expect(clockTickLabel(AXIS_END)).toMatch(/^12\s?PM$/i);
  });

  it('wraps times after midnight below the evening ones', () => {
    expect(axisMinute(23 * 60, 'top')).toBe(23 * 60);
    expect(axisMinute(60, 'top')).toBe(25 * 60);
    expect(axisMinute(7 * 60 + 26, 'bottom')).toBe(31 * 60 + 26);
    expect(axisShare(axisMinute(23 * 60, 'top'))).toBeLessThan(axisShare(axisMinute(60, 'top')));
  });

  it('clamps daytime moments towards the edge they belong to', () => {
    expect(axisMinute(14 * 60, 'top')).toBe(AXIS_START);
    expect(axisMinute(14 * 60, 'bottom')).toBe(AXIS_END);
    expect(axisShare(0)).toBe(0);
    expect(axisShare(99999)).toBe(1);
  });

  it('places a night from bedtime to wake as shares of the plot', () => {
    const shares = nightShares({ bed: 22 * 60, wake: 6 * 60, asleepMinutes: 480 });
    expect(shares.from).toBeCloseTo((22 * 60 - AXIS_START) / (AXIS_END - AXIS_START));
    expect(shares.to).toBeCloseTo((30 * 60 - AXIS_START) / (AXIS_END - AXIS_START));
    expect(shares.to).toBeGreaterThan(shares.from);
  });

  it('places the missing night placeholder between the usual times', () => {
    const shares = usualShares(23 * 60, 7 * 60);
    expect(shares).toEqual(nightShares({ bed: 23 * 60, wake: 7 * 60, asleepMinutes: 0 }));
  });
});

describe('naps', () => {
  it('draws a bar when the nap falls inside the axis', () => {
    expect(napMarkOf({ start: 22 * 60, end: 23 * 60 })).toMatchObject({ kind: 'bar' });
    expect(napMarkOf({ start: 9 * 60, end: 10 * 60 })).toMatchObject({ kind: 'bar' });
  });

  it('draws a dot at the foot when the nap is in the afternoon', () => {
    expect(napMarkOf({ start: 14 * 60 + 10, end: 14 * 60 + 39 })).toEqual({ kind: 'dot' });
    expect(napMarkOf({ start: 11 * 60, end: 13 * 60 })).toEqual({ kind: 'dot' });
  });
});

describe('columns', () => {
  it('centres one slot per column inside the plot', () => {
    const slots = slotsOf('week', 7, 44, 288);
    expect(slots).toHaveLength(7);
    expect(slots[0]?.centre).toBeCloseTo(44 + 244 / 14);
    expect(slots[6]?.centre).toBeCloseTo(288 - 244 / 14);
  });

  it('sizes bars by range', () => {
    expect(barWidthOf('week', 100)).toBe(30);
    expect(barWidthOf('week', 30)).toBeCloseTo(17.4);
    expect(barWidthOf('month', 9.7)).toBeCloseTo(6.7);
    expect(barWidthOf('month', 5)).toBe(4);
    expect(barWidthOf('year', 100)).toBe(22);
  });

  it('finds the column under a pointer and clamps at the edges', () => {
    expect(columnAt(7, 44, 288, 44)).toBe(0);
    expect(columnAt(7, 44, 288, 44 + 244 / 7 + 1)).toBe(1);
    expect(columnAt(7, 44, 288, 0)).toBe(0);
    expect(columnAt(7, 44, 288, 1000)).toBe(6);
    expect(columnAt(0, 44, 288, 100)).toBe(0);
  });

  it('steps through columns for the adjustable actions', () => {
    expect(stepColumn(0, null, 1)).toBeNull();
    expect(stepColumn(5, null, 1)).toBe(0);
    expect(stepColumn(5, null, -1)).toBe(4);
    expect(stepColumn(5, 2, 1)).toBe(3);
    expect(stepColumn(5, 4, 1)).toBe(4);
    expect(stepColumn(5, 0, -1)).toBe(0);
  });

  it('keeps the plot inside the card with the right gutter', () => {
    const frame = barsFrameOf({ width: 348, height: 200, span: 'week', wide: false });
    expect(frame.right).toBe(348 - 72);
    expect(frame.plotHeight).toBe(200 - 8 - 34);
    expect(barsFrameOf({ width: 348, height: 200, span: 'month', wide: true }).plotHeight).toBe(
      200 - 8 - 20,
    );
  });
});

describe('labels', () => {
  it('names weekdays in three letters on desktop and one letter on phones, with the date', () => {
    const wide = columnLabel('week', MONDAY, false);
    const narrow = columnLabel('week', MONDAY, true);
    expect(wide.primary).toHaveLength(3);
    expect(narrow.primary).toHaveLength(1);
    expect(wide.secondary).toBe('19');
  });

  it('labels a month only at week starts with a date', () => {
    expect(columnLabel('month', MONDAY, false).primary).toMatch(/Oct/);
    expect(columnLabel('month', MONDAY + DAY, false).primary).toBe('');
    expect(columnLabel('month', MONDAY + 7 * DAY, false).primary).toMatch(/26/);
  });

  it('labels a year with month initials', () => {
    expect(columnLabel('year', new Date(2026, 9, 1).getTime(), false)).toEqual({
      primary: 'O',
      secondary: '',
    });
  });

  it('names a column with its day, or its month and year', () => {
    expect(columnName('week', MONDAY)).toMatch(/19/);
    expect(columnName('year', MONDAY)).toMatch(/2026/);
  });
});

describe('window readout', () => {
  it('reads bedtime, wake and time asleep', () => {
    const readout = windowReadout('week', windowColumn(0));
    expect(readout.text).toMatch(/11:09\s?PM – 7:26\s?AM · 7h 57m asleep$/);
    expect(readout.rows.map((row) => row.label)).toEqual(['Bed', 'Wake', 'Asleep']);
  });

  it('adds the nap', () => {
    const readout = windowReadout(
      'week',
      windowColumn(0, { nap: { start: 14 * 60 + 10, end: 14 * 60 + 39 } }),
    );
    expect(readout.text).toMatch(/Nap 2:10\s?PM – 2:39\s?PM$/);
    expect(readout.rows[3]).toMatchObject({ label: 'Nap', value: '29m' });
  });

  it('says there is no data for a missing night', () => {
    const readout = windowReadout('week', windowColumn(2, { night: null }));
    expect(readout.text).toMatch(/ · No data$/);
    expect(readout.rows).toHaveLength(1);
  });

  it('summarises how many nights were recorded and the usual times', () => {
    const columns = [windowColumn(0), windowColumn(1, { night: null }), windowColumn(2)];
    const text = windowSummary('Sleep schedule', 'week', columns, { bed: 23 * 60, wake: 7 * 60 });
    expect(text).toMatch(/^Sleep schedule, 2 of 3 nights recorded\./);
    expect(text).toMatch(/Usual bedtime 11:00\s?PM, usual wake-up 7:00\s?AM\.$/);
    expect(windowSummary('Sleep schedule', 'year', columns, null)).toBe(
      'Sleep schedule, 2 of 3 months recorded.',
    );
  });
});
