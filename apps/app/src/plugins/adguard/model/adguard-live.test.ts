import { describe, expect, it } from 'vitest';
import { BLOCKED_RATE, LOOKUPS_RATE, LookupRateTracker, splitLookups } from './adguard-live';
import { snapshotFixture, statsFixture } from './snapshot-fixture';

const at = (seconds: number): number => Date.parse('2026-10-17T13:30:00.000Z') + seconds * 1000;

describe('LookupRateTracker', () => {
  it('needs a baseline, then reports per-second lookups and blocked lookups', () => {
    const tracker = new LookupRateTracker();
    const first = snapshotFixture({ stats: statsFixture({ queries: 100, blocked: 20 }) });
    const second = snapshotFixture({ stats: statsFixture({ queries: 130, blocked: 25 }) });
    expect(tracker.readings(first, at(0))).toEqual([]);
    expect(tracker.readings(second, at(2))).toEqual([
      [LOOKUPS_RATE, 15],
      [BLOCKED_RATE, 2.5],
    ]);
  });

  it('skips a drop in the counters and starts again from there', () => {
    const tracker = new LookupRateTracker();
    tracker.readings(
      snapshotFixture({ stats: statsFixture({ queries: 100, blocked: 20 }) }),
      at(0),
    );
    expect(
      tracker.readings(
        snapshotFixture({ stats: statsFixture({ queries: 90, blocked: 20 }) }),
        at(1),
      ),
    ).toEqual([]);
    expect(
      tracker.readings(
        snapshotFixture({ stats: statsFixture({ queries: 95, blocked: 21 }) }),
        at(2),
      ),
    ).toEqual([
      [LOOKUPS_RATE, 5],
      [BLOCKED_RATE, 1],
    ]);
  });

  it('forgets the baseline while AdGuard Home is not online', () => {
    const tracker = new LookupRateTracker();
    const online = snapshotFixture({ stats: statsFixture({ queries: 100, blocked: 20 }) });
    tracker.readings(online, at(0));
    expect(tracker.readings({ ...online, connection: { state: 'paused' } }, at(1))).toEqual([]);
    expect(tracker.readings(online, at(2))).toEqual([]);
  });
});

describe('splitLookups', () => {
  it('splits each lookup rate into allowed and blocked on the same times', () => {
    const lookups = [
      { t: 1, v: 10 },
      { t: 2, v: 4 },
      { t: 3, v: 6 },
    ];
    const blocked = [
      { t: 1, v: 3 },
      { t: 3, v: 9 },
    ];
    expect(splitLookups(lookups, blocked)).toEqual({
      allowed: [
        { t: 1, v: 7 },
        { t: 2, v: 4 },
        { t: 3, v: 0 },
      ],
      blocked: [
        { t: 1, v: 3 },
        { t: 2, v: 0 },
        { t: 3, v: 6 },
      ],
    });
  });
});
