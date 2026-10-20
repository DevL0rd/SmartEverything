import { describe, expect, it } from 'vitest';
import { TARGET_VALUE, deviceRefs } from '../../../src/automations/world-v3/refs';

describe('target values', () => {
  it('sends to the one device a wired device names', () => {
    expect(TARGET_VALUE.parse({ device: 'lamp' })).toEqual({
      kind: 'devices',
      deviceIds: ['lamp'],
    });
  });

  it('fans a wired list of devices out to every device in it', () => {
    expect(TARGET_VALUE.parse(deviceRefs(['lamp', 'fan', 'heater']))).toEqual({
      kind: 'devices',
      deviceIds: ['lamp', 'fan', 'heater'],
    });
  });

  it('refuses an empty list and a list of anything but devices', () => {
    expect(TARGET_VALUE.safeParse([]).success).toBe(false);
    expect(TARGET_VALUE.safeParse([{ room: 'kitchen' }]).success).toBe(false);
    expect(TARGET_VALUE.safeParse(['lamp']).success).toBe(false);
  });
});
