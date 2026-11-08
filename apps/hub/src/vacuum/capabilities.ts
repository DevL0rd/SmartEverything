import {
  JSON_VALUE,
  VACUUM_CLEANING_OPTIONS,
  VACUUM_CLEAN_ROOMS_KEY,
  VACUUM_CLEAN_ZONES_KEY,
  VACUUM_FAULT_KEY,
  VACUUM_FAULT_TEXT_MAX,
  VACUUM_MAP_KEY,
  VACUUM_POSE_KEY,
  VACUUM_ROOM_LINKS_KEY,
  catalogueEntryOf,
  type CapabilityKey,
  type DeviceCapability,
  type JsonValue,
  type VacuumMode,
} from '@smarteverything/domain';
import { ZONES_MAX, pv11glCatalog, vacuumAction, vacuumProperty } from '@smarteverything/xiaomi';
import { z } from 'zod';

export const VACUUM_CLEANING_KEY = 'cleaning';

export const SUCTION_NAMES = ['silent', 'standard', 'strong', 'turbo'] as const;

export const WATER_NAMES = ['off', 'level_1', 'level_2', 'level_3'] as const;

export const CLEAN_MODE_NAMES = ['sweep', 'sweep_mop', 'sweep_then_mop'] as const;

export const SUCTION_LEVELS: Readonly<Record<(typeof SUCTION_NAMES)[number], number>> = {
  silent: 1,
  standard: 2,
  strong: 3,
  turbo: 4,
};

export const WATER_LEVELS: Readonly<Record<(typeof WATER_NAMES)[number], number>> = {
  off: 0,
  level_1: 1,
  level_2: 2,
  level_3: 3,
};

export const CLEAN_MODES: Readonly<Record<VacuumMode, number>> = {
  sweep: 1,
  sweep_mop: 3,
  sweep_then_mop: 4,
};

const REPEATS_MAX = 3;
const STATE_TEXT_MAX = 256;

const RUN_OPTIONS = {
  repeats: z.number().int().min(1).max(REPEATS_MAX).optional(),
  suction: z.enum(SUCTION_NAMES).optional(),
  water: z.enum(WATER_NAMES).optional(),
  mode: z.enum(CLEAN_MODE_NAMES).optional(),
};

export const CLEAN_ROOMS_ARGUMENTS = z.strictObject({
  rooms: z.array(z.union([z.string().min(1), z.number().int().positive()])).min(1),
  ...RUN_OPTIONS,
});

export const CLEAN_ZONES_ARGUMENTS = z.strictObject({
  zones: z
    .array(z.strictObject({ x1: z.number(), y1: z.number(), x2: z.number(), y2: z.number() }))
    .min(1)
    .max(ZONES_MAX),
  repeats: RUN_OPTIONS.repeats,
});

export type CleanRoomsArguments = z.infer<typeof CLEAN_ROOMS_ARGUMENTS>;
export type CleanZonesArguments = z.infer<typeof CLEAN_ZONES_ARGUMENTS>;

function schemaOf(schema: z.ZodType): JsonValue {
  const entries = Object.entries(z.toJSONSchema(schema, { io: 'input' })).filter(
    ([name]) => name !== '$schema',
  );
  return JSON_VALUE.parse(Object.fromEntries(entries));
}

function actionOf(
  key: CapabilityKey,
  label: string,
  schema: z.ZodObject<z.ZodRawShape>,
): DeviceCapability {
  return {
    key,
    label,
    access: 'write',
    value: {
      kind: 'action',
      arguments: Object.keys(schema.shape),
      argumentSchema: schemaOf(schema),
    },
  };
}

export const VACUUM_CLEANING_CAPABILITY: DeviceCapability = {
  key: VACUUM_CLEANING_KEY,
  label: catalogueEntryOf(VACUUM_CLEANING_KEY).label,
  access: 'read_write',
  value: { kind: 'enum', options: [...VACUUM_CLEANING_OPTIONS] },
};

export const VACUUM_CLEAN_ROOMS_CAPABILITY = actionOf(
  VACUUM_CLEAN_ROOMS_KEY,
  'Clean rooms',
  CLEAN_ROOMS_ARGUMENTS,
);

export const VACUUM_CLEAN_ZONES_CAPABILITY = actionOf(
  VACUUM_CLEAN_ZONES_KEY,
  'Clean zones',
  CLEAN_ZONES_ARGUMENTS,
);

export const VACUUM_MAP_CAPABILITY: DeviceCapability = {
  key: VACUUM_MAP_KEY,
  label: 'Map version',
  access: 'read',
  value: { kind: 'text', maxLength: STATE_TEXT_MAX },
};

export const VACUUM_POSE_CAPABILITY: DeviceCapability = {
  key: VACUUM_POSE_KEY,
  label: 'Robot position',
  access: 'read',
  value: { kind: 'text', maxLength: STATE_TEXT_MAX },
};

export const VACUUM_FAULT_CAPABILITY: DeviceCapability = {
  key: VACUUM_FAULT_KEY,
  label: 'Active fault',
  access: 'read',
  value: { kind: 'text', maxLength: VACUUM_FAULT_TEXT_MAX },
};

export const VACUUM_ROOM_LINKS_CAPABILITY: DeviceCapability = {
  key: VACUUM_ROOM_LINKS_KEY,
  label: 'Room links',
  access: 'read',
  value: { kind: 'text', maxLength: STATE_TEXT_MAX },
};

export function isVacuumModel(model: string): boolean {
  return model === pv11glCatalog().model;
}

export function vacuumPropertyKey(name: string): CapabilityKey {
  const { siid, piid } = vacuumProperty('vacuum', name);
  return `raw:${String(siid)}.${String(piid)}`;
}

export function vacuumActionKey(name: string): CapabilityKey {
  const { siid, aiid } = vacuumAction('vacuum', name);
  return `raw:action.${String(siid)}.${String(aiid)}`;
}

export function vacuumCapabilities(hasPoseSource: boolean): readonly DeviceCapability[] {
  return [
    VACUUM_CLEANING_CAPABILITY,
    VACUUM_CLEAN_ROOMS_CAPABILITY,
    VACUUM_CLEAN_ZONES_CAPABILITY,
    VACUUM_MAP_CAPABILITY,
    VACUUM_FAULT_CAPABILITY,
    VACUUM_ROOM_LINKS_CAPABILITY,
    ...(hasPoseSource ? [VACUUM_POSE_CAPABILITY] : []),
  ];
}
