import {
  CAPABILITY_CATALOGUE,
  CAPABILITY_KEY,
  MODEL_OVERRIDES,
  isStandardCapability,
  presentDevice,
  type CapabilityOverride,
  type DeviceCapability,
  type DevicePresentation,
  type ValueDescriptor,
} from '@smarteverything/domain';
import type { Device } from '../../../../store/state';

const MODEL = 'xiaomi.vacuum.pv11gl';

const NUMBER: ValueDescriptor = { kind: 'number', min: 0, max: 100, step: 1 };

const CATALOGUE_DESCRIPTORS: Readonly<Record<ValueDescriptor['kind'], ValueDescriptor>> = {
  boolean: { kind: 'boolean' },
  number: NUMBER,
  enum: { kind: 'enum', options: ['Low', 'High'] },
  color: { kind: 'color' },
  text: { kind: 'text', maxLength: 20 },
  action: { kind: 'action' },
};

function descriptorOf(key: string, override: CapabilityOverride): ValueDescriptor {
  if (key.startsWith('raw:action.') || key === 'filter_reset') {
    return { kind: 'action' };
  }
  if (override.options !== undefined) {
    return { kind: 'enum', options: Object.keys(override.options) };
  }
  const parsed = CAPABILITY_KEY.parse(key);
  if (isStandardCapability(parsed)) {
    return CATALOGUE_DESCRIPTORS[CAPABILITY_CATALOGUE[parsed].kind];
  }
  return override.unit === undefined && override.format === undefined
    ? { kind: 'boolean' }
    : NUMBER;
}

function capabilitiesOf(): DeviceCapability[] {
  const override = MODEL_OVERRIDES[MODEL];
  if (override === undefined) {
    throw new Error('The pv11gl override is missing');
  }
  return Object.entries(override.capabilities).map(([key, entry]) => ({
    key: CAPABILITY_KEY.parse(key),
    label: entry.label,
    access: key.startsWith('raw:action.') || key === 'filter_reset' ? 'write' : 'read_write',
    value: descriptorOf(key, entry),
  }));
}

export function vacuumDevice(online = true): Device {
  return {
    id: 'vacuum-fixture',
    provider: 'xiaomi',
    external_id: 'vacuum-fixture',
    parent_id: null,
    kind: 'vacuum',
    name: 'Robot',
    display_name: null,
    model: MODEL,
    manufacturer: 'Xiaomi',
    provider_room: null,
    room_id: null,
    online,
    capabilities: capabilitiesOf(),
    details: {},
    hidden: false,
    favourite: false,
    position: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    label: 'Robot',
  };
}

export function vacuumPresentation(device: Device): DevicePresentation {
  return presentDevice(device);
}
