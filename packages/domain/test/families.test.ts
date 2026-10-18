import { describe, expect, it } from 'vitest';
import {
  DEVICE_CAPABILITY,
  familyDefinition,
  isBleObservable,
  isLiveControl,
  presentDevice,
  type DeviceCapability,
  type PresentedCapability,
} from '../src';

function presentedOf(key: string, value: Record<string, unknown>): PresentedCapability {
  const capability: DeviceCapability = DEVICE_CAPABILITY.parse({
    key,
    label: key,
    access: 'read_write',
    value,
  });
  const presented = presentDevice({
    kind: 'light',
    model: 'test.light.model',
    capabilities: [capability],
  }).capabilities[0];
  if (presented === undefined) throw new Error('capability was not presented');
  return presented;
}

describe('family definitions', () => {
  it('defaults a family with no entry to the primary glow and the generic level roles', () => {
    expect(familyDefinition('sensor')).toEqual({
      cardRoles: [],
      levelRoles: [
        'fan_mode',
        'favourite_level',
        'fan_speed',
        'mist_level',
        'brightness',
        'volume',
      ],
      summary: [],
      glow: 'primary',
    });
  });

  it('keeps the diffuser dark with its own summary and no generic level text', () => {
    const diffuser = familyDefinition('diffuser');
    expect(diffuser.glow).toBeNull();
    expect(diffuser.levelRoles).toEqual([]);
    expect(diffuser.summary.map((part) => part.role)).toEqual(['spray_duration', 'spray_interval']);
    expect(diffuser.cardRoles[0]).toBe('spray');
  });

  it('tints climate and light families', () => {
    expect(familyDefinition('humidifier').glow).toBe('humidity');
    expect(familyDefinition('heater').glow).toBe('temp-warm');
    expect(familyDefinition('fan').glow).toBe('temp-cool');
    expect(familyDefinition('fan').cardRoles).toEqual(familyDefinition('tower_fan').cardRoles);
    expect(familyDefinition('light').cardRoles).toEqual(['brightness', 'color_temperature']);
  });
});

describe('live controls', () => {
  it('is live for brightness, colour temperature and colour whatever the family', () => {
    const number = { kind: 'number', min: 0, max: 100, step: 1 };
    expect(isLiveControl(presentedOf('brightness', number))).toBe(true);
    expect(isLiveControl(presentedOf('color_temperature', number))).toBe(true);
    expect(isLiveControl(presentedOf('color', { kind: 'color' }))).toBe(true);
  });

  it('is not live for other roles or unrelated keys', () => {
    const number = { kind: 'number', min: 0, max: 100, step: 1 };
    expect(isLiveControl(presentedOf('fan_speed', number))).toBe(false);
    expect(isLiveControl(presentedOf('raw:1.2', number))).toBe(false);
    expect(isLiveControl(presentedOf('power', { kind: 'boolean' }))).toBe(false);
  });
});

describe('bluetooth observable devices', () => {
  it('matches only the Xiaomi door sensor', () => {
    expect(isBleObservable({ provider: 'xiaomi', model: 'isa.magnet.dw2hl' })).toBe(true);
    expect(isBleObservable({ provider: 'tuya', model: 'isa.magnet.dw2hl' })).toBe(false);
    expect(isBleObservable({ provider: 'xiaomi', model: 'zhimi.airp.vb4' })).toBe(false);
  });
});
