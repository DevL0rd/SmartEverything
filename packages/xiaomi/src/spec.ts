import type { DeviceKind } from '@smarteverything/domain';
import { z } from 'zod';
import { MiotSpecError } from './errors';

const STANDARD_NAMESPACE = 'miot-spec-v2';

export const MIOT_FORMATS = [
  'bool',
  'uint8',
  'uint16',
  'uint32',
  'int8',
  'int16',
  'int32',
  'int64',
  'float',
  'string',
  'hex',
] as const;

export type MiotFormat = (typeof MIOT_FORMATS)[number];

export const MIOT_PROPERTY = z.object({
  iid: z.number().int().positive(),
  type: z.string().min(1),
  description: z.string().default(''),
  format: z.enum(MIOT_FORMATS),
  access: z.array(z.string()),
  unit: z.string().optional(),
  'value-range': z.tuple([z.number(), z.number(), z.number()]).optional(),
  'value-list': z.array(z.object({ value: z.number(), description: z.string() })).optional(),
});

export const MIOT_ACTION = z.object({
  iid: z.number().int().positive(),
  type: z.string().min(1),
  description: z.string().default(''),
  in: z.array(z.number().int()),
  out: z.array(z.number().int()),
});

export const MIOT_EVENT = z.object({
  iid: z.number().int().positive(),
  type: z.string().min(1),
  description: z.string().default(''),
  arguments: z.array(z.number().int()),
});

export const MIOT_SERVICE = z.object({
  iid: z.number().int().positive(),
  type: z.string().min(1),
  description: z.string().default(''),
  properties: z.array(MIOT_PROPERTY).default([]),
  actions: z.array(MIOT_ACTION).default([]),
  events: z.array(MIOT_EVENT).default([]),
});

export const MIOT_SPEC = z.object({
  type: z.string().min(1),
  description: z.string().default(''),
  services: z.array(MIOT_SERVICE),
});

export const MIOT_SPEC_INDEX = z.object({
  instances: z.array(
    z.object({ model: z.string().min(1), version: z.number().int(), type: z.string().min(1) }),
  ),
});

export type MiotProperty = z.infer<typeof MIOT_PROPERTY>;
export type MiotAction = z.infer<typeof MIOT_ACTION>;
export type MiotEvent = z.infer<typeof MIOT_EVENT>;
export type MiotService = z.infer<typeof MIOT_SERVICE>;
export type MiotSpec = z.infer<typeof MIOT_SPEC>;
export type MiotSpecIndex = z.infer<typeof MIOT_SPEC_INDEX>;

export interface MiotUrn {
  readonly namespace: string;
  readonly category: string;
  readonly name: string;
  readonly standard: boolean;
}

const URN_PARTS = z
  .tuple([z.literal('urn'), z.string().min(1), z.string().min(1), z.string().min(1)])
  .rest(z.string());

export function parseUrn(type: string): MiotUrn {
  const parsed = URN_PARTS.safeParse(type.split(':'));
  if (!parsed.success) {
    throw new MiotSpecError(type, 'urn:<namespace>:<category>:<name>:...', type);
  }
  const [, namespace, category, name] = parsed.data;
  return { namespace, category, name, standard: namespace === STANDARD_NAMESPACE };
}

export function standardName(type: string): string | null {
  const urn = parseUrn(type);
  return urn.standard ? urn.name : null;
}

export function specTypeForModel(index: MiotSpecIndex, model: string): string | null {
  const candidates = index.instances.filter((instance) => instance.model === model);
  const latest = candidates.reduce<(typeof candidates)[number] | null>(
    (best, candidate) => (best === null || candidate.version > best.version ? candidate : best),
    null,
  );
  return latest === null ? null : latest.type;
}

const KIND_BY_DEVICE_TYPE: ReadonlyMap<string, DeviceKind> = new Map<string, DeviceKind>([
  ['light', 'light'],
  ['outlet', 'plug'],
  ['switch', 'switch'],
  ['air-purifier', 'air_purifier'],
  ['humidifier', 'humidifier'],
  ['dehumidifier', 'dehumidifier'],
  ['air-conditioner', 'air_conditioner'],
  ['heater', 'heater'],
  ['fan', 'fan'],
  ['thermostat', 'thermostat'],
  ['camera', 'camera'],
  ['video-doorbell', 'doorbell'],
  ['doorbell', 'doorbell'],
  ['lock', 'lock'],
  ['door-lock', 'lock'],
  ['vacuum', 'vacuum'],
  ['curtain', 'cover'],
  ['window-opener', 'cover'],
  ['television', 'television'],
  ['speaker', 'speaker'],
  ['ir-remote-control', 'ir_blaster'],
  ['gateway', 'gateway'],
  ['air-monitor', 'sensor'],
]);

export function deviceKindOf(deviceType: string): DeviceKind {
  const urn = parseUrn(deviceType);
  const kind = KIND_BY_DEVICE_TYPE.get(urn.name);
  if (kind !== undefined) {
    return kind;
  }
  return urn.name.endsWith('-sensor') ? 'sensor' : 'other';
}

const READINGS_ELSEWHERE: ReadonlyMap<string, string> = new Map([
  [
    'scale',
    'Its Bluetooth adverts, through a SmartEverything built-in scale: the Mi Home cloud keeps no weight or body-composition readings for it',
  ],
]);

export function readingsSourceOf(deviceType: string): string | null {
  return READINGS_ELSEWHERE.get(parseUrn(deviceType).name) ?? null;
}
