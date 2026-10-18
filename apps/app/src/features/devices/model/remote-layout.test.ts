import { describe, expect, it } from 'vitest';
import type { DeviceCapability } from '@smarteverything/domain';
import { canLearn, isButtonName, remoteKeysOf, remoteLayout } from './remote-layout';

describe('remoteLayout', () => {
  it('puts the direction keys on the pad whatever their spelling and keeps the rest in order', () => {
    const layout = remoteLayout([
      'Power',
      'KEY_UP',
      'Arrow Down',
      'dpad-left',
      'right',
      'Select',
      'Vol+',
    ]);
    expect(layout.pad).toEqual({
      up: 'KEY_UP',
      down: 'Arrow Down',
      left: 'dpad-left',
      right: 'right',
      ok: 'Select',
    });
    expect(layout.rest).toEqual(['Power', 'Vol+']);
  });

  it('puts a second key for the same direction among the rest', () => {
    const layout = remoteLayout(['up', 'arrow_up', 'enter', 'ok']);
    expect(layout.pad).toEqual({ up: 'up', ok: 'enter' });
    expect(layout.rest).toEqual(['arrow_up', 'ok']);
  });

  it('has an empty pad when there are no direction keys', () => {
    expect(remoteLayout(['Power', 'Mute'])).toEqual({ pad: {}, rest: ['Power', 'Mute'] });
    expect(remoteLayout([])).toEqual({ pad: {}, rest: [] });
  });
});

describe('isButtonName', () => {
  it('takes one to sixty characters once trimmed', () => {
    expect(isButtonName('')).toBe(false);
    expect(isButtonName('   ')).toBe(false);
    expect(isButtonName(' a ')).toBe(true);
    expect(isButtonName('x'.repeat(60))).toBe(true);
    expect(isButtonName('x'.repeat(61))).toBe(false);
  });
});

describe('remote capabilities', () => {
  const keys: DeviceCapability = {
    key: 'remote_key',
    label: 'Key',
    access: 'write',
    value: { kind: 'enum', options: ['power', 'mute'] },
  };
  const learn: DeviceCapability = {
    key: 'ir_learn',
    label: 'Learn',
    access: 'write',
    value: { kind: 'action' },
  };

  it('reads the keys the device can send, only when they can be written and are a list', () => {
    expect(remoteKeysOf([keys])).toEqual(['power', 'mute']);
    expect(remoteKeysOf([{ ...keys, access: 'read' }])).toEqual([]);
    expect(remoteKeysOf([{ ...keys, value: { kind: 'boolean' } }])).toEqual([]);
    expect(remoteKeysOf([])).toEqual([]);
  });

  it('can learn only with a writable learn action', () => {
    expect(canLearn([learn])).toBe(true);
    expect(canLearn([{ ...learn, access: 'read' }])).toBe(false);
    expect(canLearn([keys])).toBe(false);
  });
});
