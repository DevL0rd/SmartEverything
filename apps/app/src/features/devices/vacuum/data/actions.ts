import {
  VACUUM_CLEAN_ROOMS_KEY,
  VACUUM_CLEAN_ZONES_KEY,
  type JsonValue,
  type VacuumCleaningCommand,
} from '@smarteverything/domain';
import type { RoomSelection } from '../model/room-selection';

export const VACUUM_CLEANING_CAPABILITY = 'cleaning';

export const RUN_SUCTIONS = ['silent', 'standard', 'strong', 'turbo'] as const;

export const RUN_WATERS = ['off', 'level_1', 'level_2', 'level_3'] as const;

export const RUN_MODES = ['sweep', 'sweep_mop', 'sweep_then_mop'] as const;

export const RUN_REPEATS = [1, 2, 3] as const;

export interface RunOptions {
  readonly repeats?: (typeof RUN_REPEATS)[number];
  readonly suction?: (typeof RUN_SUCTIONS)[number];
  readonly water?: (typeof RUN_WATERS)[number];
  readonly mode?: (typeof RUN_MODES)[number];
}

export interface ZoneRect {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface VacuumCommand {
  readonly capability: string;
  readonly value: JsonValue;
}

export function cleaningCommand(command: VacuumCleaningCommand): VacuumCommand {
  return { capability: VACUUM_CLEANING_CAPABILITY, value: command };
}

export function cleanRoomsCommand(
  selection: RoomSelection,
  options: RunOptions = {},
): VacuumCommand | null {
  return selection.length === 0
    ? null
    : {
        capability: VACUUM_CLEAN_ROOMS_KEY,
        value: { rooms: [...selection], ...options },
      };
}

export function cleanZonesCommand(
  zones: readonly ZoneRect[],
  repeats?: RunOptions['repeats'],
): VacuumCommand | null {
  return zones.length === 0
    ? null
    : {
        capability: VACUUM_CLEAN_ZONES_KEY,
        value: {
          zones: zones.map(({ x1, y1, x2, y2 }) => ({ x1, y1, x2, y2 })),
          ...(repeats === undefined ? {} : { repeats }),
        },
      };
}
