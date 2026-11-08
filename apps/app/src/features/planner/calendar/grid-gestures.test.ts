import { describe, expect, it } from 'vitest';
import { draftTimeOf, slotMinute, spanBetween } from './drag-create';
import {
  SNAP_MINUTES,
  anchoredScroll,
  changedTimes,
  clampHourHeight,
  dayShiftOf,
  draggedSpan,
  minuteAt,
  sameShift,
  shiftOf,
  snapMinute,
} from './grid-gestures';

const HOUR = 60;

function hourHeightOf(value: number): { readonly get: () => number } {
  return { get: () => value };
}

describe('calendar slot taps', () => {
  it('opens quick add at the slot under the finger', () => {
    expect(slotMinute(minuteAt(9.4 * HOUR, HOUR))).toBe(9 * 60 + 15);
    expect(slotMinute(minuteAt(-20, HOUR))).toBe(0);
    expect(slotMinute(minuteAt(30 * HOUR, HOUR))).toBe(24 * 60 - SNAP_MINUTES);
  });
});

describe('drag to create', () => {
  it('spans from the pressed slot down to the finger in whole steps', () => {
    expect(spanBetween(16 * 60 + 5, 17 * 60 - 2)).toEqual({ from: 16 * 60, to: 17 * 60 });
  });

  it('keeps one step when the finger has not left the pressed slot', () => {
    expect(spanBetween(16 * 60 + 5, 16 * 60 + 5)).toEqual({ from: 16 * 60, to: 16 * 60 + 15 });
  });

  it('keeps the pressed slot when dragging upwards', () => {
    expect(spanBetween(16 * 60 + 5, 14 * 60 + 40)).toEqual({
      from: 14 * 60 + 30,
      to: 16 * 60 + 15,
    });
  });

  it('stays inside the day', () => {
    expect(spanBetween(23 * 60 + 50, 24 * 60)).toEqual({ from: 23 * 60 + 45, to: 24 * 60 });
  });

  it('labels the dashed block with its times', () => {
    expect(draftTimeOf({ from: 16 * 60, to: 17 * 60 })).toBe('16:00 to 17:00');
  });
});

describe('move and resize', () => {
  const dentist = { from: 15 * 60 + 30, to: 16 * 60 + 15 };

  it('moves a block in whole steps and keeps its length', () => {
    expect(draggedSpan('move', dentist, 52)).toEqual({ from: 16 * 60 + 15, to: 17 * 60 });
    expect(draggedSpan('move', dentist, -6)).toEqual(dentist);
  });

  it('keeps a moved block inside the day', () => {
    expect(draggedSpan('move', dentist, 20 * 60)).toEqual({ from: 23 * 60 + 15, to: 24 * 60 });
    expect(draggedSpan('move', dentist, -20 * 60)).toEqual({ from: 0, to: 45 });
  });

  it('resizes the end and never past the start', () => {
    expect(draggedSpan('end', dentist, 40)).toEqual({ from: dentist.from, to: 17 * 60 });
    expect(draggedSpan('end', dentist, -300)).toEqual({
      from: dentist.from,
      to: dentist.from + 15,
    });
  });

  it('resizes the start and never past the end', () => {
    expect(draggedSpan('start', dentist, -35)).toEqual({ from: 15 * 60, to: dentist.to });
    expect(draggedSpan('start', dentist, 300)).toEqual({ from: dentist.to - 15, to: dentist.to });
  });

  it('moves across the visible days only', () => {
    expect(dayShiftOf(130, 100, 2, 7)).toBe(1);
    expect(dayShiftOf(-450, 100, 2, 7)).toBe(-2);
    expect(dayShiftOf(900, 100, 2, 7)).toBe(4);
  });

  it('turns a drag into a shift of the start and the end', () => {
    const geometry = {
      span: dentist,
      hourHeight: hourHeightOf(HOUR),
      columnWidth: 100,
      dayIndex: 0,
      dayCount: 3,
    };
    expect(shiftOf('move', geometry, 120, 45)).toEqual({ days: 1, start: 45, end: 45 });
    expect(shiftOf('end', geometry, 120, 45)).toEqual({ days: 0, start: 0, end: 45 });
    expect(sameShift({ days: 0, start: 0, end: 0 }, shiftOf('move', geometry, 10, 4))).toBe(true);
  });

  it('applies the shift to the real times in the home zone', () => {
    const times = changedTimes(
      { start: '2026-11-06T15:30:00.000Z', end: '2026-11-06T16:15:00.000Z', due_at: null },
      { days: 1, start: 45, end: 60 },
      'Europe/London',
    );
    expect(times).toEqual({ at: '2026-11-07T16:15:00.000Z', end: '2026-11-07T17:15:00.000Z' });
  });

  it('keeps wall time when a move crosses a clock change', () => {
    const times = changedTimes(
      { start: '2026-10-24T08:00:00.000Z', end: null, due_at: null },
      { days: 1, start: 0, end: 0 },
      'Europe/London',
    );
    expect(times).toEqual({ at: '2026-10-25T09:00:00.000Z', end: null });
  });

  it('moves a task by its due time', () => {
    const times = changedTimes(
      { start: null, end: null, due_at: '2026-11-06T09:00:00.000Z' },
      { days: 0, start: -30, end: 0 },
      'UTC',
    );
    expect(times).toEqual({ at: '2026-11-06T08:30:00.000Z', end: null });
  });

  it('snaps to the nearest step', () => {
    expect(snapMinute(7)).toBe(0);
    expect(snapMinute(8)).toBe(15);
  });
});

describe('pinch zoom of the hour scale', () => {
  it('stops at the whole day in view and one hour filling the view', () => {
    expect(clampHourHeight(10, 720)).toBe(30);
    expect(clampHourHeight(80, 720)).toBe(80);
    expect(clampHourHeight(900, 720)).toBe(720);
  });

  it('keeps the minute under the fingers in place', () => {
    const anchor = { scroll: 400, focal: 200, before: 50 };
    const after = 100;
    const scroll = anchoredScroll(anchor, after);
    expect(minuteAt(scroll + anchor.focal, after)).toBe(minuteAt(anchor.scroll + anchor.focal, 50));
    expect(anchoredScroll({ scroll: 0, focal: 10, before: 50 }, 25)).toBe(0);
  });
});
