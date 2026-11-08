import { describe, expect, it } from 'vitest';
import { blockedBy } from './conditions';

const GOOD = { connected: true, wifi: true, metered: false, charging: false };

describe('backup conditions', () => {
  it('runs when nothing is required', () => {
    expect(
      blockedBy({ wifiOnly: false, chargingOnly: false }, { ...GOOD, metered: true }),
    ).toBeNull();
  });

  it('waits for a connection first', () => {
    expect(blockedBy({ wifiOnly: true, chargingOnly: true }, { ...GOOD, connected: false })).toBe(
      'offline',
    );
  });

  it('waits for unmetered Wi-Fi only when Wi-Fi only is on', () => {
    expect(blockedBy({ wifiOnly: true, chargingOnly: false }, { ...GOOD, metered: true })).toBe(
      'wifi',
    );
    expect(blockedBy({ wifiOnly: true, chargingOnly: false }, GOOD)).toBeNull();
  });

  it('does not accept unmetered cellular as Wi-Fi', () => {
    expect(blockedBy({ wifiOnly: true, chargingOnly: false }, { ...GOOD, wifi: false })).toBe(
      'wifi',
    );
  });

  it('waits for the charger only when charging only is on', () => {
    expect(blockedBy({ wifiOnly: false, chargingOnly: true }, GOOD)).toBe('charging');
    expect(
      blockedBy({ wifiOnly: false, chargingOnly: true }, { ...GOOD, charging: true }),
    ).toBeNull();
  });
});
