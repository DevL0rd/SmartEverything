import { describe, expect, it } from 'vitest';
import {
  MiioDeviceError,
  MiioPacketError,
  MiotRefusedError,
  MiotSpecError,
  MiotValueError,
  XiaomiCloudError,
  XiaomiLoginError,
} from '../src';

describe('every Xiaomi error', () => {
  it('has its own name, its structured fields and a message naming what was expected and received', () => {
    const cases = [
      [
        new MiioPacketError('a', 'b'),
        'MiioPacketError',
        'The miIO packet was refused: expected a, received b.',
      ],
      [
        new MiioDeviceError('get_prop', -1, 'busy'),
        'MiioDeviceError',
        'The device refused get_prop with code -1: busy.',
      ],
      [
        new MiotRefusedError('action', 2, 1, -4),
        'MiotRefusedError',
        'The device answered action 2.1 with code -4, expected 0 or 1.',
      ],
      [
        new XiaomiCloudError('/p', 3, 'auth err'),
        'XiaomiCloudError',
        'The Xiaomi cloud refused /p with code 3: auth err.',
      ],
      [
        new XiaomiLoginError('step', 'x', 'y'),
        'XiaomiLoginError',
        'Xiaomi sign-in failed at step: expected x, received y.',
      ],
      [
        new MiotSpecError('urn', 'x', 'y'),
        'MiotSpecError',
        'The MIoT spec for urn is unusable: expected x, received y.',
      ],
      [
        new MiotValueError('power', 'a boolean', 3),
        'MiotValueError',
        'The value for power is unusable: expected a boolean, received 3.',
      ],
    ] as const;
    for (const [error, name, message] of cases) {
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe(name);
      expect(error.message).toBe(message);
    }
  });

  it('keeps the fields it was built from', () => {
    expect(new MiioDeviceError('m', 1, 'x')).toMatchObject({
      method: 'm',
      code: 1,
      deviceMessage: 'x',
    });
    expect(new MiotRefusedError('property', 2, 3, 4)).toMatchObject({
      subject: 'property',
      siid: 2,
      iid: 3,
      code: 4,
    });
    expect(new XiaomiCloudError('/p', 2, 'm')).toMatchObject({
      path: '/p',
      code: 2,
      cloudMessage: 'm',
    });
    expect(new XiaomiLoginError('s', 'e', 'r')).toMatchObject({
      step: 's',
      expected: 'e',
      received: 'r',
    });
    expect(new MiioPacketError('e', 'r')).toMatchObject({ expected: 'e', received: 'r' });
    expect(new MiotSpecError('s', 'e', 'r')).toMatchObject({
      subject: 's',
      expected: 'e',
      received: 'r',
    });
    expect(new MiotValueError('s', 'e', 1)).toMatchObject({
      subject: 's',
      expected: 'e',
      received: 1,
    });
  });
});
