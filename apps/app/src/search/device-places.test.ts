import { describe, expect, it } from 'vitest';
import {
  CAPABILITY_CATALOGUE,
  CAPABILITY_KEY,
  MODEL_OVERRIDES,
  isStandardCapability,
  presentDevice,
  type DeviceCapability,
  type ValueDescriptor,
} from '@smarteverything/domain';
import type { Device } from '../store/state';
import { devicePlaces } from './device-places';

const DESCRIPTORS: Readonly<Record<ValueDescriptor['kind'], ValueDescriptor>> = {
  boolean: { kind: 'boolean' },
  number: { kind: 'number', min: 0, max: 100, step: 1 },
  enum: { kind: 'enum', options: ['Low', 'High'] },
  color: { kind: 'color' },
  text: { kind: 'text', maxLength: 20 },
  action: { kind: 'action' },
};

function capabilityOf(name: string): DeviceCapability {
  const key = CAPABILITY_KEY.parse(name);
  const kind = isStandardCapability(key) ? CAPABILITY_CATALOGUE[key].kind : 'boolean';
  return { key, label: name, access: 'read_write', value: DESCRIPTORS[kind] };
}

function deviceOf(model: string, keys: readonly string[], camera: boolean): Device {
  return {
    id: model,
    provider: 'xiaomi',
    external_id: model,
    parent_id: null,
    kind: camera ? 'camera' : 'switch',
    name: model,
    display_name: null,
    model,
    manufacturer: 'Test',
    provider_room: null,
    room_id: null,
    online: true,
    capabilities: keys.map(capabilityOf),
    details: {},
    hidden: false,
    favourite: false,
    position: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    label: model,
  };
}

const STANDARD = Object.keys(CAPABILITY_CATALOGUE);

const DEVICES = [
  ...Object.entries(MODEL_OVERRIDES).map(([model, override]) =>
    deviceOf(model, Object.keys(override.capabilities), override.family === 'camera'),
  ),
  deviceOf('generic', STANDARD, false),
  deviceOf('generic-camera', STANDARD, true),
];

describe('devicePlaces', () => {
  it.each(DEVICES.map((device) => [device.model, device] as const))(
    'places every visible capability of %s exactly once',
    (_, device) => {
      const visible = presentDevice(device)
        .capabilities.filter((presented) => presented.tier !== 'hidden')
        .map((presented) => presented.key)
        .sort();
      const placed = devicePlaces(device)
        .flatMap((place) => place.capabilities.map((presented) => presented.key))
        .sort();
      expect(placed).toStrictEqual(visible);
    },
  );

  it.each(DEVICES.map((device) => [device.model, device] as const))(
    'files every capability of %s on a real page section',
    (_, device) => {
      const other = devicePlaces(device).find((place) => place.title === 'Other');
      expect(other?.capabilities.map((presented) => presented.key) ?? []).toStrictEqual([]);
    },
  );

  it('files camera detection under Detection and alerts', () => {
    const camera = DEVICES.find((device) => device.model === 'xiaomi.camera.083ae2');
    const detection = camera === undefined ? [] : devicePlaces(camera);
    const place = detection.find((candidate) => candidate.title === 'Detection and alerts');
    expect(place?.capabilities.map((presented) => presented.label)).toContain(
      'Detect a crying baby',
    );
  });
});
