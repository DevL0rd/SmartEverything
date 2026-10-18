import { describe, expect, it } from 'vitest';
import type { DeviceCapability, PresentedCapability } from '@smarteverything/domain';
import type { Device, DeviceValues } from '../../../store/state';
import { deviceModelOf, type DeviceModel } from './device-model';
import { modeContextOf, shownInMode } from './mode-rules';

function modelOf(kind: Device['kind'], capabilities: DeviceCapability[]): DeviceModel {
  return deviceModelOf({
    id: 'd1',
    provider: 'local',
    external_id: 'd1',
    parent_id: null,
    kind,
    name: 'Device',
    display_name: null,
    model: 'generic',
    manufacturer: 'test',
    provider_room: null,
    room_id: null,
    online: true,
    capabilities,
    details: {},
    hidden: false,
    favourite: false,
    position: 0,
    created_at: '2026-10-16T00:00:00Z',
    updated_at: '2026-10-16T00:00:00Z',
    label: 'Device',
  });
}

function capability(
  key: DeviceCapability['key'],
  value: DeviceCapability['value'],
): DeviceCapability {
  return { key, label: key, access: 'read_write', value };
}

function values(readings: Record<string, string | boolean>): DeviceValues {
  return Object.fromEntries(
    Object.entries(readings).map(([key, value]) => [
      key,
      { value, observedAt: '2026-10-16T10:00:00Z' },
    ]),
  );
}

const PURIFIER = modelOf('air_purifier', [
  capability('purifier_mode', { kind: 'enum', options: ['auto', 'manual', 'favourite'] }),
  capability('fan_mode', { kind: 'enum', options: ['low', 'high'] }),
  capability('oscillation', { kind: 'boolean' }),
  capability('brightness', { kind: 'number', min: 0, max: 100, step: 1 }),
]);

function presented(model: DeviceModel, key: string): PresentedCapability {
  const found = model.presentation.capabilities.find((item) => item.key === key);
  if (found === undefined) {
    throw new Error(key);
  }
  return found;
}

function withRole(
  model: DeviceModel,
  key: string,
  role: 'favourite_level' | 'manual_level' | 'swing_angle',
): PresentedCapability {
  return { ...presented(model, key), role };
}

describe('modeContextOf', () => {
  it('reads the mode text and whether the device is swinging', () => {
    const context = modeContextOf(PURIFIER, values({ purifier_mode: 'manual', oscillation: true }));
    expect(context).toEqual({ family: 'air_purifier', mode: 'manual', oscillating: true });
  });

  it('has no mode when none was reported or the value is not text', () => {
    expect(modeContextOf(PURIFIER, {}).mode).toBeNull();
    expect(modeContextOf(PURIFIER, values({ purifier_mode: true })).mode).toBeNull();
    expect(modeContextOf(PURIFIER, values({ oscillation: 'yes' })).oscillating).toBe(false);
  });
});

describe('shownInMode', () => {
  const brightness = presented(PURIFIER, 'brightness');
  const fanMode = presented(PURIFIER, 'fan_mode');

  it('always shows a control that has no role', () => {
    expect(
      shownInMode({ ...brightness, role: null }, { family: 'fan', mode: null, oscillating: false }),
    ).toBe(true);
  });

  it('shows a control with a role but no rule', () => {
    expect(shownInMode(brightness, modeContextOf(PURIFIER, {}))).toBe(true);
  });

  it('shows the favourite level only in a favourite mode, spelled either way', () => {
    const level = withRole(PURIFIER, 'brightness', 'favourite_level');
    const context = (mode: string | null) =>
      ({ family: 'air_purifier', mode, oscillating: false }) as const;
    expect(shownInMode(level, context('Favourite'))).toBe(true);
    expect(shownInMode(level, context('favorite'))).toBe(true);
    expect(shownInMode(level, context('auto'))).toBe(false);
    expect(shownInMode(level, context(null))).toBe(false);
  });

  it('shows the manual level only in manual mode', () => {
    const level = withRole(PURIFIER, 'brightness', 'manual_level');
    expect(shownInMode(level, { family: 'fan', mode: 'Manual', oscillating: false })).toBe(true);
    expect(shownInMode(level, { family: 'fan', mode: 'auto', oscillating: false })).toBe(false);
  });

  it('shows the swing angle only while the device oscillates', () => {
    const angle = withRole(PURIFIER, 'brightness', 'swing_angle');
    expect(shownInMode(angle, { family: 'fan', mode: null, oscillating: true })).toBe(true);
    expect(shownInMode(angle, { family: 'fan', mode: null, oscillating: false })).toBe(false);
  });

  it('shows the fan mode of an air purifier only in manual mode, and of other devices always', () => {
    expect(
      shownInMode(fanMode, { family: 'air_purifier', mode: 'manual', oscillating: false }),
    ).toBe(true);
    expect(shownInMode(fanMode, { family: 'air_purifier', mode: 'auto', oscillating: false })).toBe(
      false,
    );
    expect(shownInMode(fanMode, { family: 'fan', mode: 'auto', oscillating: false })).toBe(true);
  });
});
