import { describe, expect, it } from 'vitest';
import { recordsOfType } from './records';
import {
  emptyCopyOf,
  goalLine,
  goalPercentOf,
  inBedLine,
  inBedParts,
  napLegendOf,
  napOnlyLine,
  napPiecesOf,
  napChipLabel,
  nightDateLabel,
  rowLine,
  stackOf,
  stripOf,
  vitalsQueryWindowOf,
} from './night-card';
import { nightOf } from './sleep';
import { stageRowsOf } from './sleep-summary';
import { at, seedRecord } from './test-support';

function stage(start: Date, end: Date, code: number): object {
  return { startTime: start.toISOString(), endTime: end.toISOString(), stage: code };
}

function night(start: Date, end: Date, stages: readonly object[]): ReturnType<typeof nightOf> {
  const [record] = recordsOfType(
    [seedRecord({ type: 'SleepSession', start, end, data: { title: null, notes: null, stages } })],
    'SleepSession',
  );
  return nightOf(record!);
}

const STAGED = night(at(7, 23), at(8, 7), [
  stage(at(7, 23), at(8, 1), 4),
  stage(at(8, 1), at(8, 2, 30), 5),
  stage(at(8, 2, 30), at(8, 3), 1),
  stage(at(8, 3), at(8, 5), 6),
  stage(at(8, 5), at(8, 7), 4),
]);

const NAP = night(at(8, 13, 20), at(8, 13, 54), [
  stage(at(8, 13, 20), at(8, 13, 25), 1),
  stage(at(8, 13, 25), at(8, 13, 54), 4),
]);

describe('night card figures', () => {
  it('rounds the goal percent down and caps it at 100', () => {
    expect(goalPercentOf(477, 480)).toBe(99);
    expect(goalPercentOf(480, 480)).toBe(100);
    expect(goalPercentOf(600, 480)).toBe(100);
    expect(goalPercentOf(100, 0)).toBe(0);
  });

  it('writes the goal, date and bed lines', () => {
    expect(goalLine(480, 99)).toBe('Goal 8h · 99%');
    expect(goalLine(450, 100)).toBe('Goal 7h 30m · 100%');
    expect(nightDateLabel(STAGED)).toBe('Thu, Oct 8');
    expect(inBedLine(STAGED)).toBe('11:00 PM – 7:00 AM · 8h 00m in bed');
    expect(inBedParts(STAGED)).toEqual({ times: '11:00 PM – 7:00 AM', duration: '8h 00m in bed' });
  });

  it('pads the vitals query by 15 minutes each side', () => {
    const window = vitalsQueryWindowOf(STAGED);
    expect(STAGED.bedtime - window.from).toBe(15 * 60_000);
    expect(window.to - STAGED.wake).toBe(15 * 60_000);
  });

  it('says what the empty and nap-only states need', () => {
    expect(emptyCopyOf(null).body).toBe('Wear your watch to bed and sync in the morning.');
    expect(emptyCopyOf('2026-10-12').body).toBe(
      'Wear your watch to bed and sync in the morning. Last night with data: Oct 12.',
    );
    expect(napOnlyLine('2026-10-19')).toBe('No night recorded for Oct 19.');
  });
});

describe('nap pieces', () => {
  it('labels the chip and sizes the strip pieces by time', () => {
    expect(napChipLabel(NAP)).toBe('Nap 1:20 PM · 29m');
    const pieces = napPiecesOf(NAP);
    expect(pieces.map((piece) => piece.stage)).toEqual(['awake', 'light']);
    expect(pieces.reduce((sum, piece) => sum + piece.share, 0)).toBeCloseTo(1);
    expect(pieces[0]?.share).toBeCloseTo(5 / 34);
  });

  it('lists the stages present with their minutes', () => {
    expect(napLegendOf(NAP).map((entry) => entry.text)).toEqual(['Awake 5m', 'Light 29m']);
  });

  it('draws one asleep piece and no legend when stages were not recorded', () => {
    const plain = night(at(8, 13), at(8, 14), []);
    expect(napPiecesOf(plain)).toEqual([{ stage: 'asleep', share: 1 }]);
    expect(napLegendOf(plain)).toEqual([]);
  });
});

describe('stage summary', () => {
  const rows = stageRowsOf(STAGED);

  it('stacks the stages by minutes in row order', () => {
    const stack = stackOf(rows);
    expect(stack.map((slice) => slice.stage)).toEqual(['deep', 'light', 'rem', 'awake']);
    expect(stack.reduce((sum, slice) => sum + slice.share, 0)).toBeCloseTo(1);
  });

  it('places the typical band and the dot on a 0 to 60 percent strip', () => {
    const deep = rows[0]!;
    const strip = stripOf(deep);
    expect(strip.bandLeft).toBeCloseTo(13 / 60);
    expect(strip.bandWidth).toBeCloseTo(10 / 60);
    expect(strip.dot).toBeCloseTo(deep.percent / 60);
    const awake = stripOf(rows[3]!);
    expect(awake.bandLeft).toBe(0);
    expect(awake.bandWidth).toBeCloseTo(10 / 60);
  });

  it('keeps the dot on the strip when a share passes 60 percent', () => {
    const light = { ...rows[1]!, percent: 80 };
    expect(stripOf(light).dot).toBe(1);
  });

  it('writes a row as name, minutes and percent', () => {
    expect(rowLine(rows[0]!)).toBe(`Deep · 1h 30m · ${String(rows[0]!.percent)}%`);
  });
});
