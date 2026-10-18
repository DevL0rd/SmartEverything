import { describe, expect, it } from 'vitest';
import { HOUR_MS, clock } from '../../../format/time';
import { contactStateText, openingsText, openingsToday, openSince } from './contact-model';

const NOW = Date.parse('2026-10-18T15:00:00');
const WINDOW = { from: NOW - 24 * HOUR_MS, to: NOW };

function segment(
  startHoursAgo: number,
  endHoursAgo: number,
): {
  readonly start: number;
  readonly end: number;
  readonly state: 'on';
} {
  return { start: NOW - startHoursAgo * HOUR_MS, end: NOW - endHoursAgo * HOUR_MS, state: 'on' };
}

describe('contact sensor openings', () => {
  it('counts only the openings since local midnight', () => {
    const segments = [segment(20, 19.9), segment(10, 9.9), segment(2, 1.9), segment(0.5, 0.4)];
    expect(openingsToday(segments, WINDOW)).toBe(3);
  });

  it('does not count a door that was already open when the window began', () => {
    const carried = { start: WINDOW.from, end: NOW - 20 * HOUR_MS, state: 'on' as const };
    expect(openingsToday([carried], WINDOW)).toBe(0);
  });

  it('words the count in full and in the short form that fits a narrow card', () => {
    expect(openingsText(0, false)).toBe('Not opened today');
    expect(openingsText(3, false)).toBe('Opened 3× today');
    expect(openingsText(3, true)).toBe('3× today');
    expect(openingsText(0, true)).toBe('0× today');
  });
});

describe('contact sensor open since', () => {
  it('names when a door that is open now was opened', () => {
    const since = openSince([segment(1, 0)], WINDOW, true);
    expect(since).toEqual({ at: NOW - HOUR_MS, carried: false, today: true });
    expect(contactStateText(true, since)).toBe(`Open since ${clock(NOW - HOUR_MS)}`);
  });

  it('says yesterday when the door was opened before midnight and is still open', () => {
    const since = openSince([segment(20, 0)], WINDOW, true);
    expect(since?.today).toBe(false);
    expect(contactStateText(true, since)).toBe(`Open since yesterday ${clock(NOW - 20 * HOUR_MS)}`);
  });

  it('says over 24 hours when it was already open when the window began', () => {
    const carried = { start: WINDOW.from, end: WINDOW.to, state: 'on' as const };
    expect(contactStateText(true, openSince([carried], WINDOW, true))).toBe('Open for over 24 h');
  });

  it('has no opening time for a closed door or one whose last opening ended', () => {
    expect(openSince([segment(5, 4)], WINDOW, true)).toBeNull();
    expect(openSince([segment(1, 0)], WINDOW, false)).toBeNull();
    expect(openSince([], WINDOW, true)).toBeNull();
  });

  it('words the state from the reading', () => {
    expect(contactStateText(true, null)).toBe('Open');
    expect(contactStateText(false, null)).toBe('Closed');
    expect(contactStateText(null, null)).toBe('Waiting for the first reading');
  });
});
