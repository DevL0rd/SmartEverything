import { describe, expect, it } from 'vitest';
import { clockText, dndRingOf, dndWindowText, encodeDndWindow, readDndWindow } from './dnd-model';

describe('clock text', () => {
  it('writes times as two digits', () => {
    expect(clockText(0, 5)).toBe('00:05');
  });
});

describe('do not disturb window', () => {
  it('reads and writes the plugin example 22:00 to 08:00', () => {
    const window = readDndWindow(369100800);
    expect(window).toStrictEqual({ startHour: 22, startMinute: 0, endHour: 8, endMinute: 0 });
    expect(window === null ? '' : dndWindowText(window)).toBe('22:00 to 08:00');
    expect(window === null ? 0 : encodeDndWindow(window)).toBe(369100800);
  });

  it('refuses equal times, out of range parts and non numbers', () => {
    expect(encodeDndWindow({ startHour: 8, startMinute: 0, endHour: 8, endMinute: 0 })).toBeNull();
    expect(encodeDndWindow({ startHour: 24, startMinute: 0, endHour: 8, endMinute: 0 })).toBeNull();
    expect(readDndWindow(0)).toBeNull();
    expect(readDndWindow('22:00')).toBeNull();
    expect(readDndWindow(undefined)).toBeNull();
    expect(readDndWindow(-1)).toBeNull();
  });

  it('draws the window over midnight as an arc from 22:00 across 10 hours', () => {
    const ring = dndRingOf({ startHour: 22, startMinute: 0, endHour: 8, endMinute: 0 });
    expect(ring.startAngle).toBeCloseTo(330);
    expect(ring.sweep).toBeCloseTo(150);
  });
});
