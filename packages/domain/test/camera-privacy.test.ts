import { describe, expect, it } from 'vitest';
import type { DeviceCapability } from '../src/devices';
import { isPrivate, privacySwitchOf } from '../src/presentation/camera-privacy';

function capability(
  key: 'privacy_mode' | 'power',
  access: DeviceCapability['access'],
  value: DeviceCapability['value'] = { kind: 'boolean' },
): DeviceCapability {
  return { key, label: key, access, value };
}

describe('privacySwitchOf', () => {
  it('uses the privacy mode, private when it is on, ahead of power', () => {
    const device = {
      capabilities: [capability('power', 'read_write'), capability('privacy_mode', 'read')],
    };
    expect(privacySwitchOf(device)).toStrictEqual({
      key: 'privacy_mode',
      privateWhen: true,
      writable: false,
    });
  });

  it('falls back to power, private when it is off', () => {
    expect(privacySwitchOf({ capabilities: [capability('power', 'write')] })).toStrictEqual({
      key: 'power',
      privateWhen: false,
      writable: true,
    });
  });

  it('ignores a privacy or power capability that is not a boolean', () => {
    const number = { kind: 'number', min: 0, max: 1, step: 1 } as const;
    expect(
      privacySwitchOf({
        capabilities: [
          capability('privacy_mode', 'read_write', number),
          capability('power', 'read', number),
        ],
      }),
    ).toBeNull();
    expect(privacySwitchOf({ capabilities: [] })).toBeNull();
  });
});

describe('isPrivate', () => {
  it('compares the reading with the value that means private', () => {
    const privacy = { key: 'privacy_mode', privateWhen: true, writable: true } as const;
    const power = { key: 'power', privateWhen: false, writable: true } as const;
    expect(isPrivate(privacy, true)).toBe(true);
    expect(isPrivate(privacy, false)).toBe(false);
    expect(isPrivate(power, false)).toBe(true);
    expect(isPrivate(power, undefined)).toBe(false);
  });
});
