import { describe, expect, it } from 'vitest';
import { muteUntil } from './mute';

const ZONE = 'America/New_York';

describe('muteUntil', () => {
  it('is off when ringing is not muted', () => {
    expect(muteUntil('off', Date.parse('2026-10-16T12:00:00Z'), ZONE)).toBeNull();
  });

  it('mutes for one hour from now', () => {
    expect(muteUntil('hour', Date.parse('2026-10-16T12:00:00Z'), ZONE)).toBe(
      '2026-10-16T13:00:00.000Z',
    );
  });

  it('mutes until seven in the morning of the home zone, not of the device', () => {
    expect(muteUntil('morning', Date.parse('2026-10-16T03:00:00Z'), ZONE)).toBe(
      '2026-10-16T11:00:00.000Z',
    );
  });

  it('rolls to the next morning once seven has passed in the home zone', () => {
    expect(muteUntil('morning', Date.parse('2026-10-16T14:00:00Z'), ZONE)).toBe(
      '2026-10-17T11:00:00.000Z',
    );
  });

  it('follows the clock change between two mornings', () => {
    expect(muteUntil('morning', Date.parse('2026-11-01T12:00:00Z'), ZONE)).toBe(
      '2026-11-02T12:00:00.000Z',
    );
  });
});
