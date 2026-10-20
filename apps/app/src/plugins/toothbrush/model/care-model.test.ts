import { describe, expect, it } from 'vitest';
import {
  batteryPath,
  batteryPlot,
  daysLeftText,
  forecastLine,
  handleFault,
  headLine,
  odometer,
  scatterPoints,
  timelineBars,
  wearTone,
  weekBars,
} from './care-model';
import { trendPath, trendY } from './trend-path';

const HEAD = {
  state: 'fitted',
  type: 'clean',
  usageS: 5400,
  limitS: 10800,
  wearPercent: 50,
  sessionsLeft: 45,
  replaceBy: null,
  madeOn: null,
  daysLeft: null,
  secondsLeft: null,
  reminder: null,
  baselineDays: null,
} as const;

describe('brush head wear', () => {
  it('turns from fresh to worn to due at the thresholds', () => {
    expect(wearTone(50, 90, 100)).toBe('fresh');
    expect(wearTone(90, 90, 100)).toBe('worn');
    expect(wearTone(100, 90, 100)).toBe('due');
  });

  it('describes each state of the head', () => {
    expect(headLine(HEAD)).toBe('50 percent worn, about 45 brushes left');
    expect(headLine({ ...HEAD, state: 'missing' })).toBe('No brush head on the handle');
    expect(headLine({ ...HEAD, state: 'unrecognised' })).toContain('not recognised');
    expect(headLine({ ...HEAD, wearPercent: null })).toBe('Brush head fitted');
  });

  it('draws the wear forecast to the day the head is used up', () => {
    const line = forecastLine(HEAD, 60, 90);
    expect(line).toEqual({
      from: { x: 0, y: 0.5 },
      to: { x: 90, y: 1 },
      warnY: 0.9,
    });
  });

  it('draws no forecast without the daily use or the limit', () => {
    expect(forecastLine(HEAD, null, 90)).toBeNull();
    expect(forecastLine({ ...HEAD, limitS: null }, 60, 90)).toBeNull();
  });

  it('shows how much of each head was used', () => {
    const bars = timelineBars([
      {
        serial: 'a',
        type: 'clean',
        firstSeen: '2026-01-01T00:00:00Z',
        lastSeen: '2026-03-01T00:00:00Z',
        usageS: 10800,
        limitS: 10800,
        current: false,
      },
      {
        serial: 'b',
        type: 'clean',
        firstSeen: '2026-03-01T00:00:00Z',
        lastSeen: '2026-04-01T00:00:00Z',
        usageS: 5400,
        limitS: 10800,
        current: true,
      },
    ]);
    expect(bars.map((bar) => bar.share)).toEqual([1, 0.5]);
    expect(bars[1]?.label).toBe('2026-03-01 to 2026-04-01, 50 percent used');
  });
});

describe('battery', () => {
  const view = {
    view: 'battery',
    battery: { percent: 60, millivolts: 3800, daysLeft: 4, low: false, charging: false },
    levels: [
      { at: '2026-10-10T00:00:00Z', value: 100 },
      { at: '2026-10-12T00:00:00Z', value: 50 },
      { at: '2026-10-14T00:00:00Z', value: 20 },
    ],
    millivolts: [
      { at: '2026-10-10T00:00:00Z', millivolts: 4100, percent: 100 },
      { at: '2026-10-14T00:00:00Z', millivolts: 3700, percent: 20 },
    ],
    charges: ['2026-10-12T00:00:00Z'],
    daysPerCharge: [4],
  } as const;

  it('spreads the levels over the time axis and marks the charges', () => {
    const plot = batteryPlot(
      {
        ...view,
        levels: [...view.levels],
        millivolts: [...view.millivolts],
        charges: [...view.charges],
        daysPerCharge: [...view.daysPerCharge],
      },
      20,
    );
    expect(plot?.points.map((point) => point.x)).toEqual([0, 0.5, 1]);
    expect(plot?.charges).toEqual([0.5]);
    expect(plot?.low).toBe(0.2);
  });

  it('draws nothing before any level was seen', () => {
    expect(
      batteryPlot({ ...view, levels: [], millivolts: [], charges: [], daysPerCharge: [] }, 20),
    ).toBeNull();
  });

  it('writes a path through the points', () => {
    const path = batteryPath(
      {
        points: [
          { x: 0, y: 1 },
          { x: 1, y: 0 },
        ],
        charges: [],
        low: 0.2,
      },
      106,
    );
    expect(path).toBe('M6.0 6.0 L100.0 106.0');
  });

  it('normalises the voltage against the charge', () => {
    const points = scatterPoints({
      ...view,
      levels: [],
      millivolts: [...view.millivolts],
      charges: [],
      daysPerCharge: [],
    });
    expect(points).toEqual([
      { x: 1, y: 1 },
      { x: 0.2, y: 0 },
    ]);
  });

  it('words the days left', () => {
    expect(daysLeftText(null)).toBeNull();
    expect(daysLeftText(0.4)).toBe('Less than a day left');
    expect(daysLeftText(4.2)).toBe('About 4 days left');
    expect(daysLeftText(1.2)).toBe('About 1 day left');
  });
});

describe('handle', () => {
  it('pads the motor hours into odometer digits', () => {
    expect(odometer(12.4)).toEqual(['0', '0', '0', '1', '2']);
    expect(odometer(null)).toEqual([]);
  });

  it('names the fault bits', () => {
    expect(
      handleFault({
        motorHours: 1,
        lifetimeSessions: 1,
        faultHex: null,
        clockIsUnix: true,
        firmware: null,
        oralb: null,
      }),
    ).toBe('No fault');
    expect(
      handleFault({
        motorHours: 1,
        lifetimeSessions: 1,
        faultHex: '4:0',
        clockIsUnix: true,
        firmware: null,
        oralb: null,
      }),
    ).toBe('Error bits 4:0');
  });

  it('shows the last twelve weeks', () => {
    const weeks = Array.from({ length: 14 }, (_, index) => ({
      weekStart: `2026-${String(index + 1).padStart(2, '0')}-01`,
      sessions: index,
    }));
    const bars = weekBars({
      view: 'handle',
      handle: {
        motorHours: null,
        lifetimeSessions: null,
        faultHex: null,
        clockIsUnix: null,
        firmware: null,
        oralb: null,
      },
      motorHours: [],
      sessionsByWeek: weeks,
    });
    expect(bars).toHaveLength(12);
    expect(bars[0]).toEqual({ label: '03-01', value: 2 });
  });
});

describe('the trend path', () => {
  const frame = { width: 112, min: 0, max: 120 };

  it('maps seconds onto the height of the plot, top for the maximum', () => {
    expect(trendY(120, frame)).toBe(6);
    expect(trendY(0, frame)).toBe(114);
  });

  it('lifts the pen across a gap', () => {
    const points = [
      { key: 'a', label: 'a', seconds: 60, before: null },
      { key: 'b', label: 'b', seconds: null, before: null },
      { key: 'c', label: 'c', seconds: 60, before: null },
    ];
    expect(trendPath(points, (point) => point.seconds, frame).split('M').length).toBe(3);
    expect(trendPath(points, (point) => point.before, frame).trim()).toBe('');
  });
});
