import { describe, expect, it } from 'vitest';
import {
  isCamera,
  isClimateAppliance,
  isClimateDevice,
  isScale,
  isWearable,
} from '../src/device-kinds';
import type { DeviceKind } from '../src/devices';
import type { DeviceCapability } from '../src/devices';
import type { PresentableDeviceWithCapabilities } from '../src/presentation/types';

const NUMBER = { kind: 'number', min: 0, max: 100, step: 1 } as const;

function capability(key: 'temperature' | 'power' | 'raw:custom'): DeviceCapability {
  return key === 'power'
    ? { key, label: key, access: 'read_write', value: { kind: 'boolean' } }
    : { key, label: key, access: 'read', value: NUMBER };
}

function device(
  kind: DeviceKind,
  model: string,
  keys: readonly ('temperature' | 'power' | 'raw:custom')[] = [],
): PresentableDeviceWithCapabilities {
  return { kind, model, capabilities: keys.map(capability) };
}

describe('device kind checks', () => {
  it('counts cameras and doorbells as cameras', () => {
    expect(isCamera(device('camera', 'x.camera.a'))).toBe(true);
    expect(isCamera(device('doorbell', 'x.doorbell.a'))).toBe(true);
    expect(isCamera(device('light', 'x.light.a'))).toBe(false);
  });

  it('recognises wearables and scales by their model, not their kind', () => {
    expect(isWearable(device('sensor', 'miwear.watch.l1'))).toBe(true);
    expect(isWearable(device('sensor', 'x.sensor.a'))).toBe(false);
    expect(isScale(device('sensor', 'yunmai.scales.ms1'))).toBe(true);
    expect(isScale(device('sensor', 'x.sensor.a'))).toBe(false);
  });

  it('counts a climate appliance by its kind', () => {
    const purifier = device('air_purifier', 'x.airp.a');
    expect(isClimateDevice(purifier)).toBe(true);
    expect(isClimateAppliance(purifier)).toBe(true);
  });

  it('counts a sensor as climate only when it reads a climate value, and never as an appliance', () => {
    const reading = device('sensor', 'x.sensor.a', ['temperature']);
    expect(isClimateDevice(reading)).toBe(true);
    expect(isClimateAppliance(reading)).toBe(false);
    expect(isClimateDevice(device('sensor', 'x.sensor.a', ['power']))).toBe(false);
    expect(isClimateDevice(device('sensor', 'x.sensor.a', ['raw:custom']))).toBe(false);
    expect(isClimateDevice(device('light', 'x.light.a', ['temperature']))).toBe(false);
  });
});
