import {
  CommandRefusedError,
  VACUUM_CLEAN_ROOMS_KEY,
  VACUUM_CLEAN_ZONES_KEY,
  isVacuumCleaningCommand,
  vacuumCleaningReading,
  vacuumPhase,
  type CapabilityKey,
  type JsonValue,
  type VacuumCleaningCommand,
} from '@smarteverything/domain';
import {
  VacuumCommandError,
  goToDock,
  pauseCleaning,
  resumeCleaning,
  startHouse,
  startRooms,
  startZones,
  stopCleaning,
  type VacuumCommand,
  type VacuumRunOptions,
} from '@smarteverything/xiaomi';
import { failureLine } from '@smarteverything/logging';
import { z } from 'zod';
import type { DeviceIo } from '../adapters/xiaomi/device-io';
import type { DerivedState, FamilyCommands } from '../adapters/xiaomi/family-hooks';
import type { InventoryEntry } from '../adapters/xiaomi/inventory';
import {
  CLEAN_MODES,
  CLEAN_ROOMS_ARGUMENTS,
  CLEAN_ZONES_ARGUMENTS,
  SUCTION_LEVELS,
  VACUUM_CLEANING_KEY,
  WATER_LEVELS,
  isVacuumModel,
  vacuumPropertyKey,
  type CleanRoomsArguments,
} from './capabilities';

export interface VacuumRoomRef {
  readonly id: number;
  readonly name: string;
}

export type VacuumCommandIo = Pick<DeviceIo, 'write' | 'action'>;

export type LiveValue = (key: CapabilityKey) => JsonValue | undefined;

const MILLIMETRES_PER_METRE = 1000;
const ROOMS_KEY = vacuumPropertyKey('room-information');
const STATUS_KEY = vacuumPropertyKey('status');

const ROOM_LIST = z.looseObject({
  rooms: z.array(z.looseObject({ id: z.number().int(), name: z.string() })).optional(),
  room_attrs: z.array(z.looseObject({ id: z.number().int(), room_name: z.string() })).optional(),
});

const CLEANING_COMMANDS: Readonly<Record<VacuumCleaningCommand, () => VacuumCommand>> = {
  start: startHouse,
  pause: pauseCleaning,
  resume: resumeCleaning,
  dock: goToDock,
  stop: stopCleaning,
};

export function liveRooms(capability: CapabilityKey, text: JsonValue | undefined): VacuumRoomRef[] {
  if (typeof text !== 'string') {
    throw new CommandRefusedError(capability, 'the robot has not reported its rooms yet');
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(text);
  } catch (cause) {
    throw new CommandRefusedError(
      capability,
      `the robot reported a room list that is not JSON (${failureLine(cause)})`,
    );
  }
  const parsed = ROOM_LIST.safeParse(decoded);
  if (!parsed.success) {
    throw new CommandRefusedError(capability, 'the robot reported a room list of another shape');
  }
  const named = parsed.data.rooms?.map(({ id, name }) => ({ id, name }));
  const attributed = parsed.data.room_attrs?.map(({ id, room_name }) => ({ id, name: room_name }));
  return named ?? attributed ?? [];
}

function describeRooms(rooms: readonly VacuumRoomRef[]): string {
  return rooms.map(({ id, name }) => `${name} (${String(id)})`).join(', ');
}

function roomIdOf(
  capability: CapabilityKey,
  wanted: string | number,
  rooms: readonly VacuumRoomRef[],
): number {
  const found =
    typeof wanted === 'number'
      ? rooms.find(({ id }) => id === wanted)
      : (rooms.find(({ name }) => name.trim().toLowerCase() === wanted.trim().toLowerCase()) ??
        rooms.find(({ id }) => String(id) === wanted.trim()));
  if (found === undefined) {
    throw new CommandRefusedError(
      capability,
      `no room matches ${JSON.stringify(wanted)}; the robot knows ${describeRooms(rooms)}`,
    );
  }
  return found.id;
}

function runOptions(
  args: Pick<CleanRoomsArguments, 'repeats' | 'suction' | 'water' | 'mode'>,
): VacuumRunOptions {
  return {
    ...(args.repeats === undefined ? {} : { cleanTimes: args.repeats }),
    ...(args.suction === undefined ? {} : { suction: SUCTION_LEVELS[args.suction] }),
    ...(args.water === undefined ? {} : { mopWater: WATER_LEVELS[args.water] }),
    ...(args.mode === undefined ? {} : { sweepMopType: CLEAN_MODES[args.mode] }),
  };
}

function parsed<T>(capability: CapabilityKey, schema: z.ZodType<T>, value: JsonValue): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new CommandRefusedError(
      capability,
      result.error.issues.map(({ path, message }) => `${path.join('.')}: ${message}`).join('; '),
    );
  }
  return result.data;
}

function zoneCorners(zone: { x1: number; y1: number; x2: number; y2: number }): number[] {
  const left = Math.min(zone.x1, zone.x2) * MILLIMETRES_PER_METRE;
  const right = Math.max(zone.x1, zone.x2) * MILLIMETRES_PER_METRE;
  const low = Math.min(zone.y1, zone.y2) * MILLIMETRES_PER_METRE;
  const high = Math.max(zone.y1, zone.y2) * MILLIMETRES_PER_METRE;
  return [left, high, left, low, right, low, right, high].map(Math.round);
}

function cleanRooms(value: JsonValue, rooms: readonly VacuumRoomRef[]): VacuumCommand {
  const args = parsed(VACUUM_CLEAN_ROOMS_KEY, CLEAN_ROOMS_ARGUMENTS, value);
  const ids = args.rooms.map((wanted) => roomIdOf(VACUUM_CLEAN_ROOMS_KEY, wanted, rooms));
  return startRooms([...new Set(ids)], runOptions(args));
}

function cleanZones(value: JsonValue): VacuumCommand {
  const args = parsed(VACUUM_CLEAN_ZONES_KEY, CLEAN_ZONES_ARGUMENTS, value);
  return startZones(args.zones.map(zoneCorners), runOptions(args));
}

function cleaning(value: JsonValue): VacuumCommand {
  const option = parsed(VACUUM_CLEANING_KEY, z.string(), value);
  if (!isVacuumCleaningCommand(option)) {
    throw new CommandRefusedError(
      VACUUM_CLEANING_KEY,
      `${option} is a reading, not a command; send ${Object.keys(CLEANING_COMMANDS).join(', ')}`,
    );
  }
  return CLEANING_COMMANDS[option]();
}

const BUILDERS: Readonly<
  Record<string, (value: JsonValue, liveValue: LiveValue) => VacuumCommand>
> = {
  [VACUUM_CLEANING_KEY]: (value) => cleaning(value),
  [VACUUM_CLEAN_ROOMS_KEY]: (value, liveValue) =>
    cleanRooms(value, liveRooms(VACUUM_CLEAN_ROOMS_KEY, liveValue(ROOMS_KEY))),
  [VACUUM_CLEAN_ZONES_KEY]: (value) => cleanZones(value),
};

export function vacuumCommandFor(
  capability: CapabilityKey,
  value: JsonValue,
  liveValue: LiveValue,
): VacuumCommand {
  const build = BUILDERS[capability];
  if (build === undefined) {
    throw new CommandRefusedError(capability, 'it is not a vacuum command');
  }
  try {
    return build(value, liveValue);
  } catch (error) {
    if (error instanceof VacuumCommandError) {
      throw new CommandRefusedError(
        capability,
        `expected ${error.expected}, received ${error.received}`,
      );
    }
    throw error;
  }
}

export async function runVacuumCommand(
  io: VacuumCommandIo,
  command: VacuumCommand,
): Promise<JsonValue> {
  if (command.properties.length > 0) {
    await io.write(command.properties);
  }
  const { action } = command;
  if (action === null) {
    return null;
  }
  return io.action(
    { siid: action.siid, aiid: action.aiid },
    action.in.map(({ piid, value }) => ({ piid, value })),
  );
}

export function vacuumDerivedStates(capability: CapabilityKey, value: JsonValue): DerivedState[] {
  if (capability !== STATUS_KEY) {
    return [];
  }
  const phase = vacuumPhase({ vacuum_status: value });
  return phase === null
    ? []
    : [{ capability: VACUUM_CLEANING_KEY, value: vacuumCleaningReading(phase) }];
}

const VACUUM_COMMANDS: FamilyCommands = {
  handles: (capability) => Object.hasOwn(BUILDERS, capability),
  execute: async (capability, value, io, liveValue) =>
    runVacuumCommand(io, vacuumCommandFor(capability, value, liveValue)),
  derive: vacuumDerivedStates,
};

export function vacuumFamilyCommands(entry: InventoryEntry): FamilyCommands | null {
  return isVacuumModel(entry.cloud.model) ? VACUUM_COMMANDS : null;
}
