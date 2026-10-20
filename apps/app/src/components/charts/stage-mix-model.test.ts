import { describe, expect, it } from 'vitest';
import {
  goalText,
  hasUnstaged,
  lineSides,
  mixDomain,
  mixReadout,
  mixSummary,
  mixTotal,
  stackOf,
  type MixColumn,
  type MixNight,
} from './stage-mix-model';

const MONDAY = new Date(2026, 9, 19).getTime();
const DAY = 24 * 60 * 60_000;

function mixColumn(offset: number, night: MixNight | null): MixColumn {
  return { key: `m${String(offset)}`, at: MONDAY + offset * DAY, night };
}

const STAGED: MixNight = { asleep: 478, stages: { deep: 138, light: 210, rem: 129 } };
const UNSTAGED: MixNight = { asleep: 420, stages: null };

describe('stage mix', () => {
  it('totals stage minutes, or the asleep time when stages are missing', () => {
    expect(mixTotal(STAGED)).toBe(477);
    expect(mixTotal(UNSTAGED)).toBe(420);
  });

  it('rounds the top up to the next two hours with headroom for goal and average', () => {
    const columns = [mixColumn(0, STAGED), mixColumn(1, null)];
    expect(mixDomain(columns, [480])).toEqual({ top: 600, ticks: [0, 120, 240, 360, 480, 600] });
    expect(mixDomain(columns, [480, 800]).top).toBe(960);
    expect(mixDomain(columns, [480, 800]).ticks).toEqual([0, 240, 480, 720, 960]);
    expect(mixDomain([], [480]).top).toBe(600);
  });

  it('stacks Deep, Light, REM bottom-up with a gap between segments', () => {
    const domain = mixDomain([mixColumn(0, STAGED)], [480]);
    const stack = stackOf(STAGED, domain, 300);
    expect(stack.map((segment) => segment.stage)).toEqual(['deep', 'light', 'rem']);
    expect(stack[0]?.bottom).toBeCloseTo(300);
    expect(stack[0]?.top).toBeCloseTo(300 - (138 / 600) * 300);
    expect(stack[1]?.bottom).toBeCloseTo((stack[0]?.top ?? 0) - 2);
    expect(stack[2]?.top).toBeCloseTo(300 - (477 / 600) * 300);
    expect(stack.map((segment) => segment.capped)).toEqual([false, false, true]);
  });

  it('draws a night without stages as one neutral segment', () => {
    const domain = mixDomain([mixColumn(0, UNSTAGED)], [480]);
    const stack = stackOf(UNSTAGED, domain, 300);
    expect(stack).toHaveLength(1);
    expect(stack[0]).toMatchObject({ stage: 'asleep', capped: true });
    expect(hasUnstaged([mixColumn(0, UNSTAGED)])).toBe(true);
    expect(hasUnstaged([mixColumn(0, STAGED), mixColumn(1, null)])).toBe(false);
  });

  it('skips stages with no minutes', () => {
    const night: MixNight = { asleep: 200, stages: { deep: 0, light: 200, rem: 0 } };
    const stack = stackOf(night, mixDomain([], [480]), 300);
    expect(stack.map((segment) => segment.stage)).toEqual(['light']);
  });

  it('reads each stage for the scrub', () => {
    const readout = mixReadout('week', mixColumn(0, STAGED));
    expect(readout.heading).toMatch(/ · 7h 57m$/);
    expect(readout.rows.map((row) => `${row.label} ${row.value}`)).toEqual([
      'Deep 2h 18m',
      'Light 3h 30m',
      'REM 2h 09m',
    ]);
    expect(readout.text).toMatch(/7h 57m asleep · Deep 2h 18m, Light 3h 30m, REM 2h 09m$/);
  });

  it('reads a missing night and a night without stages', () => {
    expect(mixReadout('week', mixColumn(0, null)).text).toMatch(/ · No data$/);
    expect(mixReadout('week', mixColumn(0, UNSTAGED)).text).toMatch(/Stages not recorded$/);
  });

  it('summarises with average and goal', () => {
    expect(
      mixSummary('Time asleep', 'month', [mixColumn(0, STAGED), mixColumn(1, null)], {
        goal: 480,
        average: 448,
      }),
    ).toBe('Time asleep, 1 of 2 nights recorded. Average 7h 28m. Goal 8h 00m.');
    expect(mixSummary('Time asleep', 'week', [], { goal: 480, average: null })).toBe(
      'Time asleep, 0 of 0 nights recorded. Goal 8h 00m.',
    );
  });

  it('writes whole hours for the goal and keeps minutes otherwise', () => {
    expect(goalText(480)).toBe('8h');
    expect(goalText(450)).toBe('7h 30m');
  });

  it('puts the label of the higher line above it and the other below', () => {
    expect(lineSides(40, 90)).toEqual({ first: 'above', second: 'below' });
    expect(lineSides(90, 40)).toEqual({ first: 'below', second: 'above' });
    expect(lineSides(50, 50)).toEqual({ first: 'above', second: 'below' });
  });
});
