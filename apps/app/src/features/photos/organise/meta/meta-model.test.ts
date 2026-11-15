import { PHOTO_META_PATCH } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  metaPatchOf,
  momentText,
  NO_SHIFT,
  offsetOfZone,
  savedText,
  shiftMinutes,
  shiftText,
  wallOf,
  ZONE_OFFSETS,
  zoneText,
} from './meta-model';

const ITEM = '00000000-0000-4000-8000-0000000000a1';
const OTHER = '00000000-0000-4000-8000-0000000000a2';

describe('date and location edits', () => {
  it('shows the wall time of a photo in its own zone and writes it back with the offset', () => {
    const wall = wallOf('2024-05-01T07:30:00.000Z', 420);
    expect(wall).toEqual({ day: '2024-05-01', minute: 14 * 60 + 30, offsetMin: 420 });
    expect(momentText(wall)).toBe('2024-05-01T14:30:00+07:00');
    expect(momentText({ day: '2023-12-31', minute: 5, offsetMin: -570 })).toBe(
      '2023-12-31T00:05:00-09:30',
    );
    expect(Date.parse(momentText(wall))).toBe(Date.parse('2024-05-01T07:30:00.000Z'));
  });

  it('crosses the day line when the zone moves the wall clock', () => {
    expect(wallOf('2024-05-01T22:00:00.000Z', 120).day).toBe('2024-05-02');
    expect(wallOf('2024-05-01T01:00:00.000Z', -300).day).toBe('2024-04-30');
  });

  it('turns a shift into signed minutes and words', () => {
    const shift = { later: false, days: 2, hours: 3, minutes: 1 };
    expect(shiftMinutes(shift)).toBe(-(2 * 1440 + 3 * 60 + 1));
    expect(shiftText(shift)).toBe('2 days 3 hours 1 minute earlier');
    expect(shiftText({ ...NO_SHIFT, hours: 1 })).toBe('1 hour later');
    expect(shiftText(NO_SHIFT)).toBe('No change yet');
  });

  it('builds a strict patch only when something changes', () => {
    const keep = { kind: 'keep' } as const;
    expect(metaPatchOf([ITEM], keep, keep)).toBeNull();
    expect(metaPatchOf([], keep, { kind: 'clear' })).toBeNull();
    expect(metaPatchOf([ITEM], { kind: 'shift', shift: NO_SHIFT }, keep)).toBeNull();
    const cleared = metaPatchOf([ITEM], keep, { kind: 'clear' });
    expect(cleared).toEqual({ itemIds: [ITEM], location: null });
    const shifted = metaPatchOf(
      [ITEM, OTHER],
      { kind: 'shift', shift: { ...NO_SHIFT, days: 1 } },
      { kind: 'set', place: { latitude: 13.75, longitude: 100.5, label: 'Bangkok' } },
    );
    expect(shifted).toEqual({
      itemIds: [ITEM, OTHER],
      date: { kind: 'shift', minutes: 1440 },
      location: { latitude: 13.75, longitude: 100.5, label: 'Bangkok' },
    });
    const set = metaPatchOf(
      [ITEM],
      { kind: 'set', wall: { day: '2020-02-29', minute: 600, offsetMin: 0 } },
      keep,
    );
    expect(set).toEqual({
      itemIds: [ITEM],
      date: { kind: 'set', takenAt: '2020-02-29T10:00:00+00:00' },
    });
    for (const patch of [cleared, shifted, set]) {
      expect(PHOTO_META_PATCH.safeParse(patch).success).toBe(true);
    }
  });

  it('names every offset and reads the offset of a named zone', () => {
    expect(zoneText(0)).toBe('UTC+00:00');
    expect(zoneText(-210)).toBe('UTC-03:30');
    expect(new Set(ZONE_OFFSETS).size).toBe(ZONE_OFFSETS.length);
    expect(ZONE_OFFSETS).toContain(345);
    expect(offsetOfZone('Asia/Bangkok', Date.parse('2024-01-01T00:00:00Z'))).toBe(420);
    expect(offsetOfZone('Asia/Kolkata', Date.parse('2024-01-01T00:00:00Z'))).toBe(330);
    expect(offsetOfZone('UTC', Date.parse('2024-01-01T00:00:00Z'))).toBe(0);
    expect(offsetOfZone('America/New_York', Date.parse('2024-07-01T12:00:00Z'))).toBe(-240);
  });

  it('says how many photos changed', () => {
    expect(savedText(1)).toBe('Date and location saved');
    expect(savedText(3)).toBe('3 photos updated');
  });
});
