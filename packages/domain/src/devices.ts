import { z } from 'zod';
import {
  ACCESS_MODES,
  CAPABILITY_KEY,
  catalogueEntryOf,
  isStandardCapability,
  type CapabilityKey,
} from './capabilities';
import { JSON_VALUE, VALUE_DESCRIPTOR, type JsonValue } from './values';

export interface StateChange {
  readonly deviceId: string;
  readonly capability: CapabilityKey;
  readonly value: JsonValue;
  readonly previous: JsonValue | undefined;
}

export const PROVIDERS = ['xiaomi', 'tuya', 'smartthings', 'samsung_tv', 'local'] as const;

export type Provider = (typeof PROVIDERS)[number];

export const PROVIDER = z.enum(PROVIDERS);

export const DEVICE_KINDS = [
  'light',
  'switch',
  'plug',
  'air_purifier',
  'humidifier',
  'dehumidifier',
  'air_conditioner',
  'heater',
  'fan',
  'thermostat',
  'sensor',
  'camera',
  'doorbell',
  'lock',
  'vacuum',
  'cover',
  'television',
  'speaker',
  'ir_blaster',
  'ir_remote',
  'gateway',
  'router',
  'file_sync',
  'dns_filter',
  'robot',
  'printer',
  'appliance',
  'computer',
  'phone',
  'other',
] as const;

export type DeviceKind = (typeof DEVICE_KINDS)[number];

export const DEVICE_CAPABILITY = z
  .object({
    key: CAPABILITY_KEY,
    label: z.string().min(1),
    access: z.enum(ACCESS_MODES),
    value: VALUE_DESCRIPTOR,
  })
  .refine(
    (capability) =>
      !isStandardCapability(capability.key) ||
      catalogueEntryOf(capability.key).kind === capability.value.kind,
    { message: 'value kind differs from the catalogue for this capability' },
  );

export type DeviceCapability = z.infer<typeof DEVICE_CAPABILITY>;

export const DISCOVERED_DEVICE = z.object({
  provider: PROVIDER,
  externalId: z.string().min(1),
  parentExternalId: z.string().min(1).nullable(),
  kind: z.enum(DEVICE_KINDS),
  name: z.string().min(1),
  model: z.string().min(1),
  manufacturer: z.string().min(1),
  room: z.string().min(1).nullable(),
  online: z.boolean(),
  capabilities: z.array(DEVICE_CAPABILITY),
  details: z.record(z.string(), JSON_VALUE),
});

export type DiscoveredDevice = z.infer<typeof DISCOVERED_DEVICE>;

export const STATE_UPDATE = z.object({
  externalId: z.string().min(1),
  capability: CAPABILITY_KEY,
  value: JSON_VALUE,
  observedAt: z.iso.datetime({ offset: true }),
});

export type StateUpdate = z.infer<typeof STATE_UPDATE>;

export function capabilityOf(
  device: Pick<DiscoveredDevice, 'capabilities'>,
  key: CapabilityKey,
): DeviceCapability | undefined {
  return device.capabilities.find((capability) => capability.key === key);
}
