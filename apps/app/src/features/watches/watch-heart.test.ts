import { HEALTH_RECORD, type HealthRecord } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  HEART_FRESH_MS,
  RELAY_STALE_MS,
  beatingBpm,
  heartPointsOf,
  heartReadingOf,
  heartViewOf,
  relayLastSeen,
} from './watch-heart';

const AT = Date.parse('2026-10-16T14:00:00Z');
const PHONE = { heartRate: 80, updatedAt: '2026-10-16T14:00:00Z' };

describe('the heart reading of a watch', () => {
  it('comes from the connected phone while the watch is worn', () => {
    expect(heartReadingOf({ phone: PHONE, details: {}, worn: true })).toEqual({ bpm: 80, at: AT });
  });

  it('is absent when the watch is off the wrist or does not say', () => {
    expect(heartReadingOf({ phone: PHONE, details: {}, worn: false })).toBeNull();
    expect(heartReadingOf({ phone: PHONE, details: {}, worn: null })).toBeNull();
  });

  it('is absent when the phone has no reading, even if the hub still has an old one', () => {
    const details = { heartRate: 70, reportedAt: '2026-10-16T13:00:00Z' };
    expect(heartReadingOf({ phone: { ...PHONE, heartRate: 0 }, details, worn: true })).toBeNull();
    expect(
      heartReadingOf({ phone: { ...PHONE, heartRate: null }, details, worn: true }),
    ).toBeNull();
  });

  it('comes from what the hub was told when no phone here holds the watch', () => {
    const details = { heartRate: 70, reportedAt: '2026-10-16T13:58:00Z' };
    expect(heartReadingOf({ phone: null, details, worn: true })).toEqual({
      bpm: 70,
      at: Date.parse('2026-10-16T13:58:00Z'),
    });
  });

  it('is absent when the hub never recorded a time or a rate', () => {
    expect(heartReadingOf({ phone: null, details: { heartRate: 70 }, worn: true })).toBeNull();
    expect(
      heartReadingOf({ phone: null, details: { reportedAt: '2026-10-16T13:58:00Z' }, worn: true }),
    ).toBeNull();
  });
});

describe('how fresh a heart reading is', () => {
  const reading = { bpm: 80, at: AT };

  it('is live up to two minutes old', () => {
    expect(heartViewOf(reading, AT + HEART_FRESH_MS)?.fresh).toBe(true);
  });

  it('shows its age after two minutes', () => {
    expect(heartViewOf(reading, AT + HEART_FRESH_MS + 1)).toEqual({ ...reading, fresh: false });
  });

  it('has no view without a reading', () => {
    expect(heartViewOf(null, AT)).toBeNull();
  });

  it('beats only while the reading is fresh', () => {
    expect(beatingBpm(heartViewOf(reading, AT))).toBe(80);
    expect(beatingBpm(heartViewOf(reading, AT + HEART_FRESH_MS + 1))).toBeNull();
    expect(beatingBpm(null)).toBeNull();
  });
});

describe('when a watch counts as last seen', () => {
  const reportedAt = '2026-10-16T14:00:00Z';

  it('never while a phone here holds the watch', () => {
    expect(relayLastSeen(true, reportedAt, AT + 5 * RELAY_STALE_MS)).toBeNull();
  });

  it('not until its relay is older than 30 minutes', () => {
    expect(relayLastSeen(false, reportedAt, AT + RELAY_STALE_MS)).toBeNull();
    expect(relayLastSeen(false, reportedAt, AT + RELAY_STALE_MS + 1)).toBe(AT);
  });

  it('not when nothing was ever reported', () => {
    expect(relayLastSeen(false, undefined, AT)).toBeNull();
  });
});

function heartRecord(samples: readonly { time: string; bpm: number }[]): HealthRecord {
  return HEALTH_RECORD.parse({
    recordId: 'r1',
    type: 'HeartRate',
    startTime: '2026-10-16T08:00:00Z',
    endTime: '2026-10-16T09:00:00Z',
    zoneOffsetSeconds: 0,
    sourceApp: 'watch',
    lastModified: '2026-10-16T08:00:00Z',
    data: { samples },
  });
}

describe('the heart line of today', () => {
  it('averages samples in five-minute buckets and orders them by time', () => {
    const points = heartPointsOf([
      heartRecord([
        { time: '2026-10-16T08:06:00Z', bpm: 70 },
        { time: '2026-10-16T08:01:00Z', bpm: 60 },
        { time: '2026-10-16T08:03:00Z', bpm: 64 },
      ]),
    ]);
    expect(points).toEqual([
      { t: Date.parse('2026-10-16T08:00:00Z'), v: 62 },
      { t: Date.parse('2026-10-16T08:05:00Z'), v: 70 },
    ]);
  });

  it('ignores records of other types', () => {
    const steps = HEALTH_RECORD.parse({
      recordId: 'r2',
      type: 'Steps',
      startTime: '2026-10-16T08:00:00Z',
      endTime: '2026-10-16T09:00:00Z',
      zoneOffsetSeconds: 0,
      sourceApp: 'watch',
      lastModified: '2026-10-16T09:00:00Z',
      data: { count: 100 },
    });
    expect(heartPointsOf([steps])).toEqual([]);
  });
});
