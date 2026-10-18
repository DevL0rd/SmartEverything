import { describe, expect, it } from 'vitest';
import { entrySpan, momentOn } from './day';

describe('momentOn', () => {
  it('puts the clock time of now on the chosen day', () => {
    const now = new Date(2026, 9, 16, 13, 45, 30, 500).getTime();
    expect(momentOn('2026-10-12', now)).toBe(new Date(2026, 9, 12, 13, 45).getTime());
  });

  it('keeps the local clock time on a day across a clock change', () => {
    const now = new Date(2026, 9, 16, 12, 0).getTime();
    const moment = new Date(momentOn('2026-03-08', now));
    expect([moment.getFullYear(), moment.getMonth(), moment.getDate()]).toEqual([2026, 2, 8]);
    expect([moment.getHours(), moment.getMinutes()]).toEqual([12, 0]);
  });
});

describe('entrySpan', () => {
  it('lasts one minute from the start and carries the local zone offset', () => {
    const start = Date.parse('2026-10-16T08:00:00Z');
    const span = entrySpan(start);
    expect(span.startTime).toBe('2026-10-16T08:00:00.000Z');
    expect(span.endTime).toBe('2026-10-16T08:01:00.000Z');
    expect(span.zoneOffsetSeconds).toBe(-new Date(start).getTimezoneOffset() * 60);
  });
});
