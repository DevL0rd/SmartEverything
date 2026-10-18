import { describe, expect, it } from 'vitest';
import { snapshotFixture, statsFixture, statusFixture } from '../model/snapshot-fixture';
import { blockingViewOf, staleCaptionOf } from './blocking-model';

const NOW = Date.parse('2026-10-17T13:30:00.000Z');
const SINCE = '2026-10-17T13:25:00.000Z';

describe('staleCaptionOf', () => {
  it('is empty while online and before setup', () => {
    expect(staleCaptionOf({ state: 'online' }, NOW)).toBeNull();
    expect(staleCaptionOf({ state: 'not_set_up' }, NOW)).toBeNull();
  });

  it('says how long AdGuard Home has been unreachable, critical', () => {
    expect(staleCaptionOf({ state: 'unreachable', reason: 'timeout', since: SINCE }, NOW)).toEqual({
      short: 'Offline · 5 min',
      long: 'Can’t reach AdGuard Home · 5 min',
      critical: true,
    });
  });

  it('marks a refused sign-in critical and the other waits quiet', () => {
    expect(staleCaptionOf({ state: 'refused', reason: 'bad' }, NOW)?.critical).toBe(true);
    for (const state of ['sign_in_needed', 'paused', 'connecting'] as const) {
      expect(staleCaptionOf({ state }, NOW)?.critical).toBe(false);
    }
  });
});

describe('a widget with no reading yet', () => {
  it('names the connection state instead of staying blank, and only waits while online', () => {
    const waiting = snapshotFixture({ stats: null });
    expect(blockingViewOf(waiting, NOW)).toBeNull();
    expect(staleCaptionOf(waiting.connection, NOW)).toBeNull();
    const states = [
      { state: 'sign_in_needed' },
      { state: 'connecting' },
      { state: 'refused', reason: 'bad' },
      { state: 'unreachable', reason: 'timeout', since: SINCE },
    ] as const;
    for (const connection of states) {
      const snapshot = snapshotFixture({ stats: null, connection });
      expect(blockingViewOf(snapshot, NOW)).toBeNull();
      expect(staleCaptionOf(snapshot.connection, NOW)?.long).toBeTruthy();
    }
  });
});

describe('blockingViewOf', () => {
  it('reads an active blocker as positive with the blocked share as the ring', () => {
    const view = blockingViewOf(snapshotFixture(), NOW);
    expect(view).toMatchObject({
      protection: 'on',
      tone: 'positive',
      percent: '18.4',
      stale: null,
      until: null,
    });
    expect(view?.ratio).toBeCloseTo(0.184);
    expect(view?.spoken).toBe('Ad blocking is on, 18.4 percent of lookups blocked');
    expect(view?.share).toContain('6,420 of 30,604');
  });

  it('reads a timed pause as warning with the end time', () => {
    const view = blockingViewOf(
      snapshotFixture({
        status: statusFixture({ protection: false, pausedUntil: '2026-10-17T14:30:00.000Z' }),
      }),
      NOW,
    );
    expect(view?.protection).toBe('paused');
    expect(view?.tone).toBe('warning');
    expect(view?.until).toMatch(/^until /);
    expect(view?.headline).toMatch(/^Paused until /);
    expect(view?.detail).toBe('Ads and trackers are not blocked.');
  });

  it('reads a switched-off blocker as off with no end time', () => {
    const view = blockingViewOf(
      snapshotFixture({ status: statusFixture({ protection: false }) }),
      NOW,
    );
    expect(view).toMatchObject({ protection: 'off', headline: 'Ad blocking is off', until: null });
  });

  it('turns neutral and stale when the server cannot be reached, keeping the last numbers', () => {
    const view = blockingViewOf(
      snapshotFixture({ connection: { state: 'unreachable', reason: 'timeout', since: SINCE } }),
      NOW,
    );
    expect(view?.tone).toBe('neutral');
    expect(view?.stale?.long).toBe('Can’t reach AdGuard Home · 5 min');
    expect(view?.percent).toBe('18.4');
  });

  it('has no face before the first reading', () => {
    expect(blockingViewOf(snapshotFixture({ stats: null }), NOW)).toBeNull();
    expect(
      blockingViewOf(snapshotFixture({ stats: statsFixture({ blocked: 0 }) }), NOW),
    ).not.toBeNull();
  });
});
