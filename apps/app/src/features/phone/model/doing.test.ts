import { describe, expect, it } from 'vitest';
import { MINUTE_MS } from '../../../format/time';
import type { PhoneDoingSegment } from '../data/phone-history';
import { doingLabel, doingTotals } from './doing';

const NOON = Date.parse('2026-10-18T12:00:00.000Z');

function segment(
  state: PhoneDoingSegment['state'],
  start: number,
  minutes: number,
): PhoneDoingSegment {
  return { state, start: NOON + start * MINUTE_MS, end: NOON + (start + minutes) * MINUTE_MS };
}

describe('doing totals', () => {
  it('adds the minutes of the same state and sorts the longest first', () => {
    const totals = doingTotals([
      segment('still', 0, 30),
      segment('walking', 30, 60),
      segment('still', 90, 45),
    ]);
    expect(totals).toEqual([
      { state: 'still', minutes: 75 },
      { state: 'walking', minutes: 60 },
    ]);
  });

  it('drops states that lasted less than half a minute', () => {
    expect(doingTotals([{ state: 'running', start: NOON, end: NOON + 10_000 }])).toEqual([]);
  });

  it('describes the day for screen readers', () => {
    expect(doingLabel(doingTotals([segment('walking', 0, 75)]))).toBe(
      'Doing today: Walking 1h 15m',
    );
    expect(doingLabel([])).toBe('Doing today: nothing recorded');
  });
});
