import {
  VACUUM_CLEANING_READINGS,
  VACUUM_FAULT_KEY,
  VacuumValueError,
  parseVacuumFault,
  presentDevice,
  vacuumJob,
  vacuumValuesOf,
  type CapabilityRole,
  type DeviceRow,
  type JsonValue,
  type VacuumCleaningReading,
  type VacuumValues,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { WorldReadDeps } from './deps';
import { parseInputs } from './inputs';
import { ReadFailure, outputsOf, type ReadHandlers, type ReadResult } from './read-port';
import { DEVICE_REF } from './refs';
import { deviceById } from './targets';

const VACUUM_READ = z.object({ vacuum: DEVICE_REF });

const CLEANING_READING = z.enum(VACUUM_CLEANING_READINGS);

const CONSUMABLE_ROLES = {
  main_brush: 'vacuum_main_brush_life',
  side_brush: 'vacuum_side_brush_life',
  filter: 'filter_life',
  mop: 'vacuum_mop_life',
  roller: 'vacuum_roller_life',
  detergent: 'vacuum_detergent_level',
  dust_bag: 'vacuum_dust_bag_life',
} as const;

const ON_A_JOB: ReadonlySet<VacuumCleaningReading> = new Set([
  'cleaning',
  'paused',
  'returning',
  'servicing',
]);

const ON_THE_DOCK: ReadonlySet<VacuumCleaningReading> = new Set(['charging', 'docked']);

const READ_ROLES: ReadonlySet<CapabilityRole> = new Set<CapabilityRole>([
  'cleaning',
  'battery',
  'vacuum_job',
  ...Object.values(CONSUMABLE_ROLES),
]);

function roomRefs(ids: readonly string[]): JsonValue {
  return ids.map((room) => ({ room }));
}

function stateOf(values: VacuumValues): VacuumCleaningReading | undefined {
  const reading = values.cleaning;
  if (reading === undefined) return undefined;
  const checked = CLEANING_READING.safeParse(reading);
  if (!checked.success) throw new VacuumValueError('cleaning', 'a cleaning state', reading);
  return checked.data;
}

function percentOf(role: string, value: JsonValue | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number') throw new VacuumValueError(role, 'a percentage', value);
  return value;
}

function consumablesOf(values: VacuumValues): Readonly<Record<string, number>> | undefined {
  const reported = Object.entries(CONSUMABLE_ROLES).flatMap(([name, role]) => {
    const percent = percentOf(role, values[role]);
    return percent === undefined ? [] : [[name, percent] as const];
  });
  return reported.length === 0 ? undefined : Object.fromEntries(reported);
}

function faultOf(deps: WorldReadDeps, device: DeviceRow): string | undefined {
  const text = deps.observed(device.id, VACUUM_FAULT_KEY);
  if (text === undefined) return undefined;
  if (typeof text !== 'string') throw new VacuumValueError('fault', 'a fault text', text);
  return parseVacuumFault(text)?.title ?? '';
}

function cleaningRoomsOf(
  deps: WorldReadDeps,
  device: DeviceRow,
  values: VacuumValues,
  state: VacuumCleaningReading | undefined,
): readonly string[] | undefined {
  if (state === undefined) return undefined;
  if (!ON_A_JOB.has(state)) return [];
  const job = vacuumJob(values);
  if (job === null) return undefined;
  const homeRooms = new Map(
    deps.store.vacuumRoomLinks
      .list(device.id)
      .filter((link) => link.missingSince === null)
      .map((link) => [link.mapRoomId, link.roomId] as const),
  );
  return [...new Set(job.rooms.flatMap((mapRoom) => homeRooms.get(mapRoom) ?? []))];
}

function valuesOf(deps: WorldReadDeps, device: DeviceRow): VacuumValues {
  const presentation = presentDevice(device);
  if (presentation.family !== 'vacuum')
    throw new ReadFailure('Invalid', `${device.name} is not a robot vacuum`);
  return vacuumValuesOf(
    presentation.capabilities
      .filter(({ role }) => role !== null && READ_ROLES.has(role))
      .map(({ key, role }) => ({ key, role })),
    (key) => deps.observed(device.id, key),
  );
}

function vacuumRead(deps: WorldReadDeps, vacuum: string): ReadResult {
  const device = deviceById(deps.store, vacuum);
  const values = valuesOf(deps, device);
  try {
    const state = stateOf(values);
    const rooms = cleaningRoomsOf(deps, device, values, state);
    return outputsOf({
      state,
      cleaningRooms: rooms === undefined ? undefined : roomRefs(rooms),
      battery: percentOf('battery', values.battery),
      fault: faultOf(deps, device),
      docked: state === undefined ? undefined : ON_THE_DOCK.has(state),
      consumables: consumablesOf(values),
    });
  } catch (cause) {
    if (cause instanceof VacuumValueError) throw new ReadFailure('Failed', cause.message);
    throw cause;
  }
}

export function vacuumReadHandlers(deps: WorldReadDeps): ReadHandlers {
  return {
    'vacuum.read': (inputs): ReadResult => {
      const { vacuum } = parseInputs('vacuum.read', VACUUM_READ, inputs);
      return vacuumRead(deps, vacuum);
    },
  };
}
