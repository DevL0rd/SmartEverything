import { afterEach, describe, expect, it, vi } from 'vitest';
import { zoneOffsetSeconds } from '../src';

const WINTER = new Date('2026-01-15T12:00:00Z');
const SUMMER = new Date('2026-07-15T12:00:00Z');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('zoneOffsetSeconds', () => {
  it('is zero for UTC', () => {
    expect(zoneOffsetSeconds('UTC', WINTER)).toBe(0);
  });

  it('is positive east of Greenwich and negative west of it', () => {
    expect(zoneOffsetSeconds('Asia/Bangkok', WINTER)).toBe(7 * 3600);
    expect(zoneOffsetSeconds('America/New_York', WINTER)).toBe(-5 * 3600);
  });

  it('follows daylight saving time on the given date', () => {
    expect(zoneOffsetSeconds('Europe/London', WINTER)).toBe(0);
    expect(zoneOffsetSeconds('Europe/London', SUMMER)).toBe(3600);
  });

  it('keeps the minutes of a half-hour zone with its sign', () => {
    expect(zoneOffsetSeconds('Asia/Kolkata', WINTER)).toBe(5 * 3600 + 30 * 60);
    expect(zoneOffsetSeconds('America/St_Johns', WINTER)).toBe(-(3 * 3600 + 30 * 60));
  });

  it('reads a plain GMT from the formatter as no offset', () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, 'formatToParts').mockReturnValue([
      { type: 'timeZoneName', value: 'GMT' },
    ]);
    expect(zoneOffsetSeconds('Europe/London', WINTER)).toBe(0);
  });

  it('names the zone and what Intl gave when the offset cannot be read', () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, 'formatToParts').mockReturnValue([
      { type: 'timeZoneName', value: 'Mars time' },
    ]);
    expect(() => zoneOffsetSeconds('Asia/Bangkok', WINTER)).toThrow(
      'The offset of Asia/Bangkok could not be read; Intl gave Mars time.',
    );
  });

  it('says Intl gave nothing when the formatter returns no zone name', () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, 'formatToParts').mockReturnValue([]);
    expect(() => zoneOffsetSeconds('Asia/Bangkok', WINTER)).toThrow('Intl gave nothing.');
  });
});
