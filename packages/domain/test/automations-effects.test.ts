import { describe, expect, it } from 'vitest';
import {
  DeviceEffectValueError,
  deviceEffectSupport,
  resolveDeviceEffects,
  validateDeviceEffect,
  type DeviceCapability,
  type DeviceEffect,
  type ValueDescriptor,
} from '../src';

const BRIGHTNESS: ValueDescriptor = { kind: 'number', min: 1, max: 100, step: 1 };

function effect(
  operation: DeviceEffect['operation'],
  priority: number,
  order: number,
): DeviceEffect {
  return {
    id: `4e000000-0000-4000-8000-00000000000${String(order)}`,
    runId: '4e000000-0000-4000-8000-0000000000aa',
    nodeId: '4e000000-0000-4000-8000-0000000000bb',
    operation,
    priority,
    order,
    expiresAt: '2026-10-08T11:00:00.000Z',
  };
}

describe('C19 resolving stacked temporary changes', () => {
  it('returns the base when nothing is stacked', () => {
    expect(resolveDeviceEffects(BRIGHTNESS, 60, [])).toBe(60);
  });

  it('applies Set and Add in priority order, then activation order', () => {
    const stack = [
      effect({ type: 'add', value: 5 }, 10, 3),
      effect({ type: 'set', value: 20 }, 0, 1),
      effect({ type: 'add', value: 10 }, 0, 2),
    ];
    expect(resolveDeviceEffects(BRIGHTNESS, 60, stack)).toBe(35);
  });

  it('lets a later Set at equal priority replace an earlier one', () => {
    const stack = [
      effect({ type: 'set', value: 20 }, 0, 1),
      effect({ type: 'set', value: 35 }, 0, 2),
    ];
    expect(resolveDeviceEffects(BRIGHTNESS, 60, stack)).toBe(35);
  });

  it('lets the higher priority win over a later change of lower priority', () => {
    const stack = [
      effect({ type: 'set', value: 80 }, 10, 1),
      effect({ type: 'set', value: 20 }, 0, 2),
    ];
    expect(resolveDeviceEffects(BRIGHTNESS, 60, stack)).toBe(80);
  });

  it('keeps the result inside the range and on the step of the control', () => {
    expect(resolveDeviceEffects(BRIGHTNESS, 90, [effect({ type: 'add', value: 50 }, 0, 1)])).toBe(
      100,
    );
    expect(resolveDeviceEffects(BRIGHTNESS, 10, [effect({ type: 'add', value: -50 }, 0, 1)])).toBe(
      1,
    );
    const coarse: ValueDescriptor = { kind: 'number', min: 0, max: 100, step: 25 };
    expect(resolveDeviceEffects(coarse, 50, [effect({ type: 'add', value: 10 }, 0, 1)])).toBe(50);
    expect(resolveDeviceEffects(coarse, 50, [effect({ type: 'add', value: 15 }, 0, 1)])).toBe(75);
  });

  it('sets a non-numeric control but refuses to add to it', () => {
    const power: ValueDescriptor = { kind: 'boolean' };
    expect(resolveDeviceEffects(power, true, [effect({ type: 'set', value: false }, 0, 1)])).toBe(
      false,
    );
    expect(() =>
      resolveDeviceEffects(power, true, [effect({ type: 'add', value: 1 }, 0, 1)]),
    ).toThrow(DeviceEffectValueError);
  });
});

describe('C19 what a temporary change may touch', () => {
  it('refuses actions and non-finite numbers', () => {
    expect(() => {
      validateDeviceEffect({ kind: 'action' }, { type: 'set', value: 1 });
    }).toThrow('Actions cannot be temporary state changes.');
    expect(() => {
      validateDeviceEffect(BRIGHTNESS, { type: 'set', value: 'x' });
    }).toThrow('Numeric Set requires a finite number.');
    expect(() => {
      validateDeviceEffect({ kind: 'boolean' }, { type: 'add', value: 1 });
    }).toThrow('Only numeric controls support Add.');
  });

  it('supports only controls that can be read and written and are not actions', () => {
    const control = (
      access: DeviceCapability['access'],
      value: ValueDescriptor,
    ): DeviceCapability => ({
      key: 'brightness',
      label: 'Brightness',
      access,
      value,
    });
    expect(deviceEffectSupport(control('read_write', BRIGHTNESS))).toBeNull();
    expect(deviceEffectSupport(control('read', BRIGHTNESS))).toBe(
      'This control must support reading and writing.',
    );
    expect(deviceEffectSupport(control('read_write', { kind: 'action' }))).toBe(
      'Actions cannot be temporary state changes.',
    );
  });
});
