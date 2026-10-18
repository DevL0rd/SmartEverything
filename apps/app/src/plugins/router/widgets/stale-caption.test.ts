import { describe, expect, it } from 'vitest';
import { phaseShare } from './speed-progress';
import { staleCaptionOf } from './stale-caption';

const NOW = Date.parse('2026-10-17T13:45:00.000+00:00');

describe('staleCaptionOf', () => {
  it('says how long the router has been unreachable', () => {
    const caption = staleCaptionOf(
      { state: 'unreachable', reason: 'timeout', since: '2026-10-17T13:40:00.000+00:00' },
      NOW,
    );
    expect(caption).toEqual({
      short: 'Offline · 5 min',
      long: 'Can’t reach the router · 5 min',
      critical: true,
    });
  });

  it('counts at least one minute', () => {
    const caption = staleCaptionOf(
      { state: 'unreachable', reason: 'timeout', since: '2026-10-17T13:44:50.000+00:00' },
      NOW,
    );
    expect(caption?.short).toBe('Offline · 1 min');
  });

  it('explains a paused or connecting router without alarm', () => {
    expect(staleCaptionOf({ state: 'paused' }, NOW)).toEqual({
      short: 'Paused',
      long: 'Monitoring is paused',
      critical: false,
    });
    expect(staleCaptionOf({ state: 'connecting' }, NOW)?.long).toBe('Connecting…');
  });

  it('has no caption while online or not set up', () => {
    expect(staleCaptionOf({ state: 'online' }, NOW)).toBeNull();
    expect(staleCaptionOf({ state: 'not_set_up' }, NOW)).toBeNull();
  });
});

describe('phaseShare', () => {
  it('moves forward through ping, download and upload', () => {
    const shares = [phaseShare('ping'), phaseShare('download'), phaseShare('upload')];
    expect(shares[0]).toBeLessThan(shares[1] ?? 0);
    expect(shares[1]).toBeLessThan(shares[2] ?? 0);
    expect(shares[2]).toBeLessThan(1);
  });

  it('is empty when no test is measuring', () => {
    expect(phaseShare(null)).toBe(0);
    expect(phaseShare('done')).toBe(0);
    expect(phaseShare('failed')).toBe(0);
  });
});
