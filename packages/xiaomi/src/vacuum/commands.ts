import type { JsonValue } from '@smarteverything/domain';
import { z } from 'zod';
import { parseJson } from '../json';
import { actionParams, setPropertiesParams, type PropertyWrite } from '../miot';
import type { VacuumAction, VacuumSafety } from './catalog-schema';
import { VacuumCodecError } from './codecs';
import {
  VacuumCatalogError,
  vacuumAction,
  vacuumProperty,
  type VacuumServiceKey,
} from './pv11gl-catalog';
import { actionSafety } from './pv11gl-safety';
import { vacuumStationFunctions } from './pv11gl-station';

export class VacuumCommandError extends Error {
  override readonly name = 'VacuumCommandError';

  constructor(
    readonly command: string,
    readonly expected: string,
    readonly received: string,
  ) {
    super(`The ${command} command was refused: expected ${expected}, received ${received}.`);
  }
}

export type VacuumPushed = (siid: number, piid: number) => JsonValue | undefined;

export interface VacuumBudget {
  readonly wakeMs: number;
  readonly settleMs: number;
}

export interface VacuumExpectation {
  readonly summary: string;
  readonly budget: VacuumBudget;
  readonly met: (pushed: VacuumPushed) => boolean;
}

export interface VacuumActionInput {
  readonly piid: number;
  readonly value: JsonValue;
}

export interface VacuumActionCall {
  readonly siid: number;
  readonly aiid: number;
  readonly name: string;
  readonly in: readonly VacuumActionInput[];
}

export interface VacuumCommand {
  readonly id: string;
  readonly properties: readonly PropertyWrite[];
  readonly action: VacuumActionCall | null;
  readonly safety: VacuumSafety;
  readonly expect: VacuumExpectation;
}

export interface VacuumWire {
  readonly set: JsonValue | null;
  readonly action: JsonValue | null;
}

export interface VacuumRunOptions {
  readonly sweepMopType?: number;
  readonly cleanTimes?: number;
  readonly suction?: number;
  readonly mopWater?: number;
  readonly sweepRoute?: number;
}

export const COMMAND_BUDGET: VacuumBudget = { wakeMs: 3000, settleMs: 5000 };
export const ZONES_MAX = 5;
export const FLOOR_MATERIAL = {
  none: 0,
  'ceramic-tile': 4000,
  'wood-floor': 4010,
  'horizontal-wood-floor': 4011,
  cobblestone: 4020,
  marble: 4030,
} as const;

export type FloorMaterial = keyof typeof FLOOR_MATERIAL;

const SWEEP_TYPE = { house: 1, zone: 2, room: 3 } as const;
const STATUS = { working: 4, paused: 5, returning: 6 } as const;
const STATION_IDLE = 0;
const CORNERS = 8;
export const INT = z.number().int();
const CONFIG = z.object({
  clean_mode: INT,
  rooms: z.array(INT).optional(),
  zones: z.array(z.array(z.number())).optional(),
});
const FAULTS = z.object({ fault: z.array(INT) });
const STATION = z.object({ mode: INT });
const ROOM_INFO = z.object({
  room_attrs: z
    .array(
      z.object({
        id: INT,
        room_name: z.string(),
        floor: INT.optional(),
        notshow: INT.optional(),
      }),
    )
    .optional(),
  rooms: z.array(z.object({ id: INT, name: z.string() })).optional(),
});

const RUN_OPTIONS = [
  ['sweepMopType', 'sweep-mop-type'],
  ['cleanTimes', 'clean-times'],
  ['suction', 'mode'],
  ['mopWater', 'mop-water-output-level'],
  ['sweepRoute', 'sweep-route'],
] as const;

export function reader(
  pushed: VacuumPushed,
  service: VacuumServiceKey,
): (name: string) => JsonValue | undefined {
  return (name) => {
    const property = vacuumProperty(service, name);
    return pushed(property.siid, property.piid);
  };
}

export function attempt<T>(read: () => T): T | null {
  try {
    return read();
  } catch (error) {
    if (error instanceof VacuumCodecError) return null;
    throw error;
  }
}

export function pushedObject<T>(value: JsonValue | undefined, schema: z.ZodType<T>): T | null {
  if (typeof value !== 'string') return null;
  const raw = attempt(() =>
    parseJson(value, (cause) => new VacuumCodecError('pushed value', 'JSON text', cause)),
  );
  const result = schema.safeParse(raw);
  return result.success ? result.data : null;
}

export function sameList(a: readonly unknown[] | undefined, b: readonly unknown[]): boolean {
  return a !== undefined && JSON.stringify(a) === JSON.stringify(b);
}

function statusIs(status: number): (pushed: VacuumPushed) => boolean {
  return (pushed) => reader(pushed, 'vacuum')('status') === status;
}

export interface Spec {
  readonly action: VacuumAction | null;
  readonly inputs?: readonly VacuumActionInput[];
  readonly properties?: readonly PropertyWrite[];
}

export function make(
  id: string,
  spec: Spec,
  expect: Pick<VacuumExpectation, 'summary' | 'met'>,
): VacuumCommand {
  const { action } = spec;
  return {
    id,
    properties: spec.properties ?? [],
    action:
      action === null
        ? null
        : { siid: action.siid, aiid: action.aiid, name: action.name, in: spec.inputs ?? [] },
    safety: action === null ? 'safe-physical' : actionSafety(action),
    expect: { ...expect, budget: COMMAND_BUDGET },
  };
}

export function tagged(action: VacuumAction, value: JsonValue): VacuumActionInput {
  const piid = action.inputs[0];
  if (piid === undefined) throw new VacuumCatalogError('action input', action.service, action.name);
  return { piid, value };
}

function runBatch(options: VacuumRunOptions): readonly PropertyWrite[] {
  return RUN_OPTIONS.flatMap(([key, name]) => {
    const value = options[key];
    if (value === undefined) return [];
    const property = vacuumProperty('vacuum', name);
    const allowed = property.values.map((option) => option.value);
    if (!allowed.includes(value)) {
      throw new VacuumCommandError(name, `one of ${allowed.join(', ')}`, String(value));
    }
    return [{ siid: property.siid, piid: property.piid, value }];
  });
}

function configMet(
  type: number,
  targets: (config: z.infer<typeof CONFIG>) => boolean,
): (pushed: VacuumPushed) => boolean {
  return (pushed) => {
    const vacuum = reader(pushed, 'vacuum');
    const config = pushedObject(vacuum('current-cleaning-config'), CONFIG);
    return (
      vacuum('sweep-type') === type &&
      config !== null &&
      config.clean_mode === type &&
      targets(config)
    );
  };
}

function plain(
  name: string,
  summary: string,
  met: (pushed: VacuumPushed) => boolean,
  service: VacuumServiceKey = 'vacuum',
): VacuumCommand {
  return make(name, { action: vacuumAction(service, name) }, { summary, met });
}

export function startHouse(options: VacuumRunOptions = {}): VacuumCommand {
  return make(
    'start-house',
    { action: vacuumAction('vacuum', 'start-sweep'), properties: runBatch(options) },
    {
      summary: 'sweep type whole house and the running config says whole house',
      met: configMet(SWEEP_TYPE.house, () => true),
    },
  );
}

export function startRooms(
  roomIds: readonly number[],
  options: VacuumRunOptions = {},
): VacuumCommand {
  const [first, ...rest] = roomIds;
  if (
    first === undefined ||
    !roomIds.every((id) => Number.isInteger(id) && id > 0) ||
    new Set(roomIds).size !== roomIds.length
  ) {
    throw new VacuumCommandError(
      'start-rooms',
      'one or more distinct positive room ids',
      JSON.stringify(roomIds),
    );
  }
  const action = vacuumAction('vacuum', 'start-vacuum-room-sweep');
  const text = rest.length === 0 ? String(first) : JSON.stringify(roomIds);
  return make(
    'start-rooms',
    { action, inputs: [tagged(action, text)], properties: runBatch(options) },
    {
      summary: 'sweep type room and the running config rooms equal the ids',
      met: configMet(SWEEP_TYPE.room, (config) => sameList(config.rooms, roomIds)),
    },
  );
}

export function startZones(
  zones: readonly (readonly number[])[],
  options: VacuumRunOptions = {},
): VacuumCommand {
  if (
    zones.length === 0 ||
    zones.length > ZONES_MAX ||
    zones.some((zone) => zone.length !== CORNERS || !zone.every(Number.isFinite))
  ) {
    throw new VacuumCommandError(
      'start-zones',
      `1 to ${String(ZONES_MAX)} zones of ${String(CORNERS)} numbers`,
      JSON.stringify(zones),
    );
  }
  const action = vacuumAction('vacuum', 'start-zone-sweep');
  const text = JSON.stringify(zones.map((zone) => ({ blocks_region: zone, blocks_attr: 0 })));
  return make(
    'start-zones',
    { action, inputs: [tagged(action, text)], properties: runBatch(options) },
    {
      summary: 'sweep type zone and the running config zones equal the corners',
      met: configMet(SWEEP_TYPE.zone, (config) => sameList(config.zones, zones)),
    },
  );
}

export const pauseCleaning = (): VacuumCommand =>
  plain('pause-sweeping', 'status paused', statusIs(STATUS.paused));
export const resumeCleaning = (): VacuumCommand =>
  plain('continue-sweep', 'status working', statusIs(STATUS.working));
export const goToDock = (): VacuumCommand =>
  plain('stop-and-gocharge', 'status returning', statusIs(STATUS.returning));

export const stopCleaning = (): VacuumCommand =>
  plain('stop-sweeping', 'the running config is cleared', (pushed) => {
    const config = pushedObject(reader(pushed, 'vacuum')('current-cleaning-config'), CONFIG);
    return config !== null && config.clean_mode === 0;
  });

export const findRobot = (): VacuumCommand =>
  plain(
    'identify',
    'the robot is awake',
    (pushed) => reader(pushed, 'vacuum')('sleep-status') === false,
    'identify',
  );

export function closeAlert(code: number): VacuumCommand {
  if (!Number.isInteger(code) || code <= 0) {
    throw new VacuumCommandError('close-abnormal-card', 'a positive fault code', String(code));
  }
  const action = vacuumAction('vacuum', 'close-abnormal-card');
  return make(
    'close-alert',
    { action, inputs: [tagged(action, JSON.stringify({ fault: [code] }))] },
    {
      summary: 'the fault list no longer holds the code',
      met: (pushed) => {
        const faults = pushedObject(reader(pushed, 'vacuum')('fault-ids'), FAULTS);
        return faults !== null && !faults.fault.includes(code);
      },
    },
  );
}

export type StationStartId = 'dust-collection' | 'roller-wash' | 'dry';
export type StationStopId = 'roller-wash' | 'dry';

function stationMode(pushed: VacuumPushed): number | null {
  return (
    pushedObject(reader(pushed, 'vacuum')('base-station-working-status'), STATION)?.mode ?? null
  );
}

function stationFunction(id: StationStartId): {
  start: VacuumAction;
  stop: VacuumAction | null;
  mode: number;
} {
  const found = vacuumStationFunctions().find((entry) => entry.id === id);
  if (found?.mode === undefined || found.mode === null) {
    throw new VacuumCommandError('station', 'a station function with a mode', id);
  }
  return { start: found.start, stop: found.stop, mode: found.mode };
}

export function stationStart(id: StationStartId): VacuumCommand {
  const { start, mode } = stationFunction(id);
  return make(
    `station-${id}-start`,
    { action: start },
    {
      summary: `the station works in mode ${String(mode)}`,
      met: (pushed) => stationMode(pushed) === mode,
    },
  );
}

export function stationStop(id: StationStopId): VacuumCommand {
  const { stop } = stationFunction(id);
  if (stop === null)
    throw new VacuumCommandError('station-stop', 'a function with a stop action', id);
  return make(
    `station-${id}-stop`,
    { action: stop },
    {
      summary: 'the station is idle',
      met: (pushed) => stationMode(pushed) === STATION_IDLE,
    },
  );
}

function roomAttributes(
  id: string,
  roomId: number,
  fields: Readonly<Record<string, JsonValue>>,
  met: (entry: NonNullable<z.infer<typeof ROOM_INFO>['room_attrs']>[number]) => boolean,
): VacuumCommand {
  if (!Number.isInteger(roomId) || roomId <= 0) {
    throw new VacuumCommandError(id, 'a positive room id', String(roomId));
  }
  const action = vacuumAction('vacuum', 'set-room-clean-configs');
  const text = JSON.stringify({ room_attrs: [{ id: roomId, ...fields }] });
  return make(
    id,
    { action, inputs: [tagged(action, text)] },
    {
      summary: 'the room attributes list shows the change',
      met: (pushed) => {
        const info = pushedObject(reader(pushed, 'vacuum')('room-information'), ROOM_INFO);
        return (info?.room_attrs ?? []).some((entry) => entry.id === roomId && met(entry));
      },
    },
  );
}

export function roomFloor(roomId: number, material: FloorMaterial): VacuumCommand {
  const floor = FLOOR_MATERIAL[material];
  return roomAttributes('room-floor', roomId, { floor }, (entry) => entry.floor === floor);
}

export function roomVisibility(roomId: number, hidden: boolean): VacuumCommand {
  const notshow = hidden ? 1 : 0;
  return roomAttributes(
    'room-visibility',
    roomId,
    { notshow },
    (entry) => (entry.notshow ?? 0) === notshow,
  );
}

export function commandWire(did: string, command: VacuumCommand): VacuumWire {
  const { action } = command;
  return {
    set: command.properties.length === 0 ? null : setPropertiesParams(did, command.properties),
    action:
      action === null
        ? null
        : actionParams(
            did,
            action,
            action.in.map(({ piid, value }) => ({ piid, value })),
          ),
  };
}
