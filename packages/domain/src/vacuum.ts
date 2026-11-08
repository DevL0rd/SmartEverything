import { z } from 'zod';
import type { CapabilityKey } from './capabilities';
import type { CapabilityRole } from './presentation/types';
import type { JsonValue } from './values';
import { VACUUM_ROLES, type VacuumValueRole, type VacuumValues } from './vacuum-roles';
import {
  VACUUM_CHARGING_STATES,
  VACUUM_MODES,
  VACUUM_STATION_MODES,
  VACUUM_STATUS_TABLE,
  VACUUM_SWEEP_MOP_STATES,
  VACUUM_SCOPES,
  isVacuumTaskPhase,
  type VacuumChargingState,
  type VacuumMode,
  type VacuumPhase,
  type VacuumScope,
  type VacuumStationMode,
  type VacuumSweepMopState,
} from './vacuum-status';

export * from './vacuum-roles';
export * from './vacuum-room-links';
export * from './vacuum-fault';
export * from './vacuum-finish';
export * from './vacuum-status';

export class VacuumValueError extends Error {
  override readonly name = 'VacuumValueError';

  constructor(
    readonly role: string,
    readonly expected: string,
    readonly received: unknown,
    options?: ErrorOptions,
  ) {
    super(
      `The robot's ${role} should be ${expected}. Received ${JSON.stringify(received)}.`,
      options,
    );
  }
}

function entryOf(status: JsonValue): (typeof VACUUM_STATUS_TABLE)[number] | undefined {
  return typeof status === 'number'
    ? VACUUM_STATUS_TABLE.find((entry) => entry.value === status)
    : VACUUM_STATUS_TABLE.find((entry) => entry.spec === status);
}

export function vacuumPhase(values: VacuumValues): VacuumPhase | null {
  const status = values.vacuum_status;
  return status === undefined ? null : (entryOf(status)?.phase ?? null);
}

export function isVacuumAwake(values: VacuumValues): boolean {
  return values.vacuum_asleep === false || isVacuumTaskPhase(vacuumPhase(values));
}

function numbered<const Row extends { readonly value: number; readonly spec: string }>(
  values: VacuumValues,
  role: VacuumValueRole,
  rows: readonly Row[],
): Row | null {
  const value = values[role];
  if (value === undefined) {
    return null;
  }
  return rows.find((row) => row.value === value || row.spec === value) ?? null;
}

export function vacuumScope(values: VacuumValues): VacuumScope | null {
  return numbered(values, 'vacuum_scope', VACUUM_SCOPES)?.scope ?? null;
}

export function vacuumMode(values: VacuumValues): VacuumMode | null {
  return numbered(values, 'vacuum_mode', VACUUM_MODES)?.mode ?? null;
}

export function vacuumChargingState(values: VacuumValues): VacuumChargingState | null {
  return numbered(values, 'charging_state', VACUUM_CHARGING_STATES)?.state ?? null;
}

export function vacuumSweepMopState(values: VacuumValues): VacuumSweepMopState | null {
  return numbered(values, 'vacuum_sweep_mop_status', VACUUM_SWEEP_MOP_STATES)?.state ?? null;
}

const STATION_STATUS = z.looseObject({
  mode: z.number().int(),
  progress: z.number().min(0).optional(),
});

export interface VacuumStation {
  readonly mode: VacuumStationMode | null;
  readonly rawMode: number;
  readonly progress: number | null;
}

function parsedJson(role: string, text: JsonValue | undefined, expected: string): unknown {
  if (typeof text !== 'string') {
    throw new VacuumValueError(role, expected, text);
  }
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new VacuumValueError(role, expected, text, { cause });
  }
}

export function vacuumStation(values: VacuumValues): VacuumStation | null {
  const text = values.vacuum_station_mode;
  if (text === undefined) {
    return null;
  }
  const parsed = STATION_STATUS.safeParse(
    parsedJson('vacuum_station_mode', text, 'a JSON object with a mode'),
  );
  if (!parsed.success) {
    throw new VacuumValueError('vacuum_station_mode', 'a JSON object with a mode', text);
  }
  const named = VACUUM_STATION_MODES.find((row) => row.value === parsed.data.mode);
  return {
    mode: named?.mode ?? null,
    rawMode: parsed.data.mode,
    progress: parsed.data.progress ?? null,
  };
}

const FAULT_LIST = z.looseObject({ fault: z.array(z.number().int().nonnegative()) });

export function vacuumFaultCodes(values: VacuumValues): readonly number[] {
  const text = values.vacuum_fault_ids;
  if (text === undefined) {
    return [];
  }
  const parsed = FAULT_LIST.safeParse(
    parsedJson('vacuum_fault_ids', text, 'a JSON object with a fault list'),
  );
  if (!parsed.success) {
    throw new VacuumValueError('vacuum_fault_ids', 'a JSON object with a fault list', text);
  }
  return parsed.data.fault.filter((code) => code !== 0);
}

const JOB = z.looseObject({
  rooms: z.array(z.number().int()).optional(),
  zones: z.array(z.array(z.number())).optional(),
});

export interface VacuumJob {
  readonly rooms: readonly number[];
  readonly zones: readonly (readonly number[])[];
}

export function vacuumJob(values: VacuumValues): VacuumJob | null {
  const text = values.vacuum_job;
  if (text === undefined) {
    return null;
  }
  const parsed = JOB.safeParse(parsedJson('vacuum_job', text, 'a JSON object'));
  if (!parsed.success) {
    throw new VacuumValueError('vacuum_job', 'a JSON object', text);
  }
  return { rooms: parsed.data.rooms ?? [], zones: parsed.data.zones ?? [] };
}

const VACUUM_VALUE_ROLES: ReadonlySet<CapabilityRole> = new Set<CapabilityRole>([
  ...VACUUM_ROLES,
  'fault',
  'charging_state',
  'battery',
  'suction',
  'mop_level',
  'volume',
  'child_lock',
  'dnd',
  'filter_life',
  'cleaning',
]);

export function isVacuumValueRole(role: CapabilityRole | null): role is VacuumValueRole {
  return role !== null && VACUUM_VALUE_ROLES.has(role);
}

export interface VacuumRoleSource {
  readonly key: CapabilityKey;
  readonly role: CapabilityRole | null;
}

export function vacuumValuesOf(
  capabilities: readonly VacuumRoleSource[],
  read: (key: CapabilityKey) => JsonValue | undefined,
): VacuumValues {
  const entries = capabilities.flatMap((capability) => {
    const value = read(capability.key);
    return isVacuumValueRole(capability.role) && value !== undefined
      ? [[capability.role, value] as const]
      : [];
  });
  return Object.fromEntries(entries);
}
