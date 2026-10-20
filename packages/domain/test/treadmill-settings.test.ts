import { describe, expect, it } from 'vitest';
import { TREADMILL_SETTINGS_CHANGE, settingsOf } from '../src';

describe('incline settings', () => {
  it('start safe', () => {
    const settings = settingsOf(undefined);
    expect(settings.inclineScale).toBe('unconfirmed');
    expect(settings.policy.remoteIncline).toBe(false);
  });

  it('accept an owner change of the scale and the remote cap', () => {
    const change = TREADMILL_SETTINGS_CHANGE.parse({
      inclineScale: 'levels',
      policy: { remoteIncline: true, remoteInclineMax: 8 },
    });
    expect(change.inclineScale).toBe('levels');
    expect(() => TREADMILL_SETTINGS_CHANGE.parse({ inclineScale: 'degrees' })).toThrow();
  });
});
