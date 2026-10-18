import { describe, expect, it } from 'vitest';
import type { PhoneFacts } from '../../types';
import { deviceFixture } from '../../../../store/device-fixture';
import { visualStateOf } from '../visual-state';
import { PHONE_UNKNOWN, phoneFacts } from './phone';

function facts(values: Record<string, string | number | boolean>): PhoneFacts {
  const device = deviceFixture(0, { kind: 'phone', model: 'smarteverything.android' });
  const observed = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      { value, observedAt: '2026-10-18T10:00:00.000Z' },
    ]),
  );
  return phoneFacts(visualStateOf({ ...device, online: true }, observed));
}

describe('what the phone visual shows', () => {
  it('draws a lit screen and nothing else for a phone that reported nothing', () => {
    expect(facts({})).toEqual({ ...PHONE_UNKNOWN, screenOn: true });
  });

  it('reads the battery, charging, torch, call, ringing and notification count', () => {
    expect(
      facts({
        battery: 12,
        charging: true,
        flashlight: 'on',
        in_call: true,
        ringing: true,
        notification_count: 7,
        playback: 'playing',
      }),
    ).toMatchObject({
      level: 12,
      charging: true,
      torch: true,
      inCall: true,
      ringing: true,
      notifications: 7,
      playing: true,
    });
  });

  it('shows Do not disturb over the ringer mode', () => {
    expect(facts({ ringer_mode: 'vibrate' }).ringer).toBe('vibrate');
    expect(facts({ ringer_mode: 'vibrate', dnd: true }).ringer).toBe('dnd');
  });

  it('turns the screen dark only when the phone says it is off', () => {
    expect(facts({ screen_on: false }).screenOn).toBe(false);
    expect(facts({ screen_on: true }).screenOn).toBe(true);
  });

  it('calls a phone hot from a moderate heat state upward', () => {
    expect(facts({ thermal_state: 'light' }).hot).toBe(false);
    expect(facts({ thermal_state: 'moderate' }).hot).toBe(true);
  });

  it('ignores a reading of the wrong kind', () => {
    expect(facts({ battery: 'full', ringing: 'yes', flashlight: 'blink' })).toEqual(PHONE_UNKNOWN);
  });
});
