import { ApiError, targetCapability, type JsonValue } from '@smarteverything/domain';
import type { EffectRequest } from '@smarteverything/flow/interpret/frames';
import { z } from 'zod';
import type { Store } from '../../store/store';
import { CLEAN_ROOMS_ARGUMENTS } from '../../vacuum/capabilities';
import { effectFailure } from '../effect-failure';
import { outputs, parsed } from '../engine-v3-effects';
import { DEVICE_REF, ROOM_REF } from '../world-v3/refs';
import { modeOf } from './action-mode';
import { stampOf } from './command-metadata';
import type { DeviceSetter } from './device-set';
import type { EffectHandlers, EffectRun } from './effect-run';

export interface VacuumEffectPorts {
  readonly store: Store;
  readonly setter: Pick<DeviceSetter, 'set'>;
}

export const VACUUM_COMMANDS = ['start', 'pause', 'resume', 'stop', 'dock', 'spot'] as const;

export const VACUUM_STATION_JOBS = [
  'empty_dust',
  'wash_mop',
  'stop_wash',
  'back_wash',
  'dry_mop',
  'stop_dry',
  'eject',
  'clean_station',
  'empty_station_tank',
  'empty_host_tank',
  'start_roller_wash',
  'stop_roller_wash',
  'start_water_check',
  'cancel_water_check',
] as const;

const CLEANING_CONTROL = 'cleaning';
const SPOT_CONTROL = 'vacuum_spot_clean';
const CLEAN_ROOMS_CONTROL = 'vacuum_clean_rooms';

const COMMAND_PARAMS = z.object({ vacuum: DEVICE_REF, action: z.enum(VACUUM_COMMANDS) });

const STATION_PARAMS = z.object({ vacuum: DEVICE_REF, action: z.enum(VACUUM_STATION_JOBS) });

const CLEAN_ROOMS_PARAMS = z.object({
  vacuum: DEVICE_REF,
  rooms: z.array(ROOM_REF).min(1),
  mode: z.enum(['sweep', 'sweep_mop', 'sweep_then_mop']).optional(),
  suction: z.enum(['silent', 'standard', 'strong', 'turbo']).optional(),
  water: z.enum(['off', 'level_1', 'level_2', 'level_3']).optional(),
  passes: z.number().int().optional(),
});

type CleanRoomsAsk = z.infer<typeof CLEAN_ROOMS_PARAMS>;

interface Call {
  readonly request: EffectRequest;
  readonly run: EffectRun;
}

interface Control {
  readonly control: string;
  readonly value: JsonValue;
}

function commandControl(action: (typeof VACUUM_COMMANDS)[number]): Control {
  return action === 'spot'
    ? { control: SPOT_CONTROL, value: null }
    : { control: CLEANING_CONTROL, value: action };
}

function ensureVacuum(store: Store, deviceId: string, control: string): string {
  const device = store.devices.byId(deviceId);
  if (targetCapability(device, control)?.writable !== true)
    throw new ApiError('command_refused', `${device.name} does not support this.`);
  return device.name;
}

async function send(
  ports: VacuumEffectPorts,
  deviceId: string,
  { control, value }: Control,
  { request, run }: Call,
): Promise<void> {
  ensureVacuum(ports.store, deviceId, control);
  await ports.setter.set(
    {
      target: { kind: 'devices', deviceIds: [deviceId] },
      control,
      value: () => value,
      percent: false,
      serialised: false,
      mode: modeOf(request),
      at: stampOf(request.path),
    },
    run,
  );
}

function controlHandler<T extends { readonly vacuum: string }>(
  ports: VacuumEffectPorts,
  schema: z.ZodType<T>,
  controlOf: (ask: T) => Control,
): EffectHandlers[string] {
  return async (params, request, run) => {
    const checked = parsed(schema, params);
    if (!checked.ok) return checked;
    try {
      await send(ports, checked.value.vacuum, controlOf(checked.value), { request, run });
      return { ok: true, value: outputs({ ok: true }) };
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}

interface RoomPlan {
  readonly mapRoomIds: readonly number[];
  readonly linked: readonly string[];
  readonly unlinked: readonly string[];
}

function planRooms(store: Store, deviceId: string, wanted: readonly string[]): RoomPlan {
  const present = new Map(
    store.vacuumRoomLinks
      .list(deviceId)
      .filter((link) => link.missingSince === null)
      .map((link) => [link.roomId, link.mapRoomId] as const),
  );
  const rooms = [...new Set(wanted)];
  const linked = rooms.filter((room) => present.has(room));
  return {
    mapRoomIds: linked.flatMap((room) => present.get(room) ?? []),
    linked,
    unlinked: rooms.filter((room) => !present.has(room)),
  };
}

function roomNames(store: Store, ids: readonly string[]): string {
  const known = new Map(store.rooms.list().map((room) => [room.id, room.name]));
  return ids.map((id) => known.get(id) ?? id).join(', ');
}

function cleanRoomsValue(ask: CleanRoomsAsk, mapRoomIds: readonly number[]): JsonValue {
  const value = {
    rooms: [...mapRoomIds],
    ...(ask.mode === undefined ? {} : { mode: ask.mode }),
    ...(ask.suction === undefined ? {} : { suction: ask.suction }),
    ...(ask.water === undefined ? {} : { water: ask.water }),
    ...(ask.passes === undefined ? {} : { repeats: ask.passes }),
  };
  const checked = CLEAN_ROOMS_ARGUMENTS.safeParse(value);
  if (!checked.success) throw new ApiError('invalid_request', z.prettifyError(checked.error));
  return value;
}

const roomRefs = (ids: readonly string[]): JsonValue => ids.map((room) => ({ room }));

function cleanRooms(ports: VacuumEffectPorts): EffectHandlers[string] {
  return async (params, request, run) => {
    const checked = parsed(CLEAN_ROOMS_PARAMS, params);
    if (!checked.ok) return checked;
    const ask = checked.value;
    try {
      const name = ensureVacuum(ports.store, ask.vacuum, CLEAN_ROOMS_CONTROL);
      const plan = planRooms(ports.store, ask.vacuum, ask.rooms);
      if (plan.mapRoomIds.length === 0)
        throw new ApiError(
          'command_refused',
          `${roomNames(ports.store, plan.unlinked)} ${plan.unlinked.length === 1 ? 'is' : 'are'} not linked to a room of the map of ${name}. Link the rooms on its page first.`,
        );
      await send(
        ports,
        ask.vacuum,
        { control: CLEAN_ROOMS_CONTROL, value: cleanRoomsValue(ask, plan.mapRoomIds) },
        { request, run },
      );
      return {
        ok: true,
        value: outputs({
          started: true,
          rooms: roomRefs(plan.linked),
          unlinkedRooms: roomRefs(plan.unlinked),
        }),
      };
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}

export function vacuumEffects(ports: VacuumEffectPorts): EffectHandlers {
  return {
    'vacuum.command': controlHandler(ports, COMMAND_PARAMS, (ask) => commandControl(ask.action)),
    'vacuum.station': controlHandler(ports, STATION_PARAMS, (ask) => ({
      control: `vacuum_${ask.action}`,
      value: null,
    })),
    'vacuum.clean_rooms': cleanRooms(ports),
  };
}
