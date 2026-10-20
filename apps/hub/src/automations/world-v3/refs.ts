import { DEVICE_FAMILIES, type DeviceTarget, type JsonValue } from '@smarteverything/domain';
import { z } from 'zod';

const ID = z.string().min(1);

export const DEVICE_REF = z.object({ device: ID }).transform((ref) => ref.device);

export const ROOM_REF = z.strictObject({ room: ID }).transform((ref) => ref.room);

export const GROUP_REF = z.strictObject({ group: ID }).transform((ref) => ref.group);

export const PERSON_REF = z.strictObject({ person: ID }).transform((ref) => ref.person);

export const VALUE_REF = z.strictObject({ value: ID }).transform((ref) => ref.value);

const ROOM_TARGET = z
  .strictObject({ room: ID, families: z.array(z.enum(DEVICE_FAMILIES)).min(1).optional() })
  .transform((target): DeviceTarget => ({
    kind: 'room',
    roomId: target.room,
    ...(target.families === undefined ? {} : { families: target.families }),
  }));

export const TARGET_VALUE = z.union([
  z
    .strictObject({ device: ID })
    .transform((target): DeviceTarget => ({ kind: 'devices', deviceIds: [target.device] })),
  z
    .strictObject({ devices: z.array(ID).min(1) })
    .transform((target): DeviceTarget => ({ kind: 'devices', deviceIds: target.devices })),
  z
    .array(z.strictObject({ device: ID }))
    .min(1)
    .transform((refs): DeviceTarget => ({
      kind: 'devices',
      deviceIds: refs.map((ref) => ref.device),
    })),
  z
    .strictObject({ group: ID })
    .transform((target): DeviceTarget => ({ kind: 'group', groupId: target.group })),
  ROOM_TARGET,
]);

export function deviceRefs(ids: readonly string[]): JsonValue {
  return ids.map((device) => ({ device }));
}

export function personRefs(ids: readonly string[]): JsonValue {
  return ids.map((person) => ({ person }));
}
