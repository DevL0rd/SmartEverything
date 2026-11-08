import {
  API_ENDPOINTS,
  ApiError,
  CommandRefusedError,
  VACUUM_CONSUMABLE_ROLES,
  VACUUM_SCENE_ANSWER,
  VacuumValueError,
  isVacuumAwake,
  presentValue,
  vacuumChargingState,
  vacuumJob,
  vacuumMode,
  vacuumPhase,
  vacuumScope,
  vacuumStation,
  vacuumValuesOf,
  type CapabilityRole,
  type JsonValue,
  type PresentedCapability,
  type VacuumCleanSummary,
  type VacuumSceneAnswer,
  type VacuumValues,
} from '@smarteverything/domain';
import { VacuumCodecError } from '@smarteverything/xiaomi';
import { liveRooms, type VacuumRoomRef } from '../../../vacuum/command-service';
import { operate } from './acting';
import { DECIMETRE, compactRoom, pointOf, poseOf, roundTo } from './vacuum-map-compact';
import { definePart, type PartContext, type PartSource } from './device-parts';

type MapRead =
  | { readonly status: 'not_loaded' }
  | { readonly status: 'loaded'; readonly scene: VacuumSceneAnswer }
  | { readonly status: 'unavailable'; readonly reason: string };

type CleansRead =
  | { readonly status: 'not_loaded' }
  | { readonly status: 'loaded'; readonly last: VacuumCleanSummary | null }
  | { readonly status: 'unavailable'; readonly reason: string };

interface VacuumLoaded {
  readonly map: MapRead;
  readonly cleans: CleansRead;
  readonly now: Date | null;
}

const UNLOADED: VacuumLoaded = {
  map: { status: 'not_loaded' },
  cleans: { status: 'not_loaded' },
  now: null,
};

const MILLISECONDS = 1000;

const ROLE_SET: ReadonlySet<CapabilityRole> = new Set<CapabilityRole>([
  ...VACUUM_CONSUMABLE_ROLES,
  'filter_life',
]);

function problemOf(error: unknown): string | null {
  return error instanceof VacuumValueError ||
    error instanceof VacuumCodecError ||
    error instanceof CommandRefusedError
    ? error.message
    : null;
}

class Problems {
  readonly lines: string[] = [];

  attempt<Result>(read: () => Result): Result | null {
    try {
      return read();
    } catch (error) {
      const line = problemOf(error);
      if (line === null) {
        throw error;
      }
      this.lines.push(line);
      return null;
    }
  }
}

function roleOf(source: PartSource, role: CapabilityRole): PresentedCapability | undefined {
  return source.presented.find((presented) => presented.role === role);
}

function valueOf(source: PartSource, role: CapabilityRole): JsonValue | undefined {
  const presented = roleOf(source, role);
  return presented === undefined ? undefined : source.states.get(presented.key)?.value;
}

function shownOf(source: PartSource, role: CapabilityRole): string | null {
  const presented = roleOf(source, role);
  const value = valueOf(source, role);
  return presented === undefined || value === undefined ? null : presentValue(presented, value);
}

function valuesOf(source: PartSource): VacuumValues {
  return vacuumValuesOf(source.presented, (key) => source.states.get(key)?.value);
}

function roomsOf(source: PartSource, problems: Problems): readonly VacuumRoomRef[] {
  const presented = roleOf(source, 'vacuum_rooms');
  const value = presented === undefined ? undefined : valueOf(source, 'vacuum_rooms');
  if (presented === undefined || typeof value !== 'string') {
    return [];
  }
  return problems.attempt(() => liveRooms(presented.key, value)) ?? [];
}

function roomsPart(
  map: MapRead,
  named: readonly VacuumRoomRef[],
): readonly Record<string, unknown>[] {
  if (map.status === 'loaded') {
    return map.scene.rooms.map(compactRoom);
  }
  return named.map(({ id, name }) => ({ id, name, area_m2: null }));
}

function jobRoomNames(
  rooms: readonly number[],
  known: readonly { readonly id: number; readonly name: string }[],
): string[] {
  return rooms.map((id) => known.find((room) => room.id === id)?.name ?? `Room ${String(id)}`);
}

function jobPart(
  source: PartSource,
  values: VacuumValues,
  known: readonly { readonly id: number; readonly name: string }[],
  problems: Problems,
): Record<string, unknown> | null {
  const job = problems.attempt(() => vacuumJob(values));
  if (job === null) {
    return null;
  }
  return {
    scope: problems.attempt(() => vacuumScope(values)),
    mode: problems.attempt(() => vacuumMode(values)),
    rooms: jobRoomNames(job.rooms, known),
    zones: job.zones.length,
    progress_percent: values.vacuum_progress ?? null,
    area_shown: shownOf(source, 'vacuum_area'),
    seconds: values.vacuum_seconds ?? null,
  };
}

function stationPart(
  source: PartSource,
  values: VacuumValues,
  problems: Problems,
): Record<string, unknown> | null {
  const station = problems.attempt(() => vacuumStation(values));
  if (station === null) {
    return null;
  }
  return {
    mode: station.mode,
    progress: station.progress,
    drying_left: shownOf(source, 'vacuum_dry_left'),
    sewage_tank: shownOf(source, 'vacuum_sewage_tank'),
    clean_water_tank: shownOf(source, 'vacuum_water_tank'),
  };
}

function consumablesPart(source: PartSource): readonly Record<string, unknown>[] {
  return source.presented.flatMap((presented) => {
    const value = source.states.get(presented.key)?.value;
    return presented.role !== null && ROLE_SET.has(presented.role) && value !== undefined
      ? [{ label: presented.label, shown_as: presentValue(presented, value), unit: presented.unit }]
      : [];
  });
}

function ageSeconds(moment: string, now: Date | null): number | null {
  const at = Date.parse(moment);
  return now === null || Number.isNaN(at)
    ? null
    : Math.max(0, Math.round((now.getTime() - at) / MILLISECONDS));
}

function mapPart(source: PartSource, loaded: VacuumLoaded): Record<string, unknown> {
  const version = valueOf(source, 'vacuum_map_id') ?? source.states.get('raw:vacuum_map')?.value;
  const observed = source.states.get('raw:vacuum_map')?.observed_at ?? null;
  if (loaded.map.status !== 'loaded') {
    return {
      version: version ?? null,
      observed_at: observed,
      age_seconds: observed === null ? null : ageSeconds(observed, loaded.now),
      loaded: loaded.map.status === 'unavailable' ? loaded.map.reason : false,
    };
  }
  return sceneMapPart(loaded.map.scene, version, loaded.now);
}

function sceneMapPart(
  scene: VacuumSceneAnswer,
  version: JsonValue | undefined,
  now: Date | null,
): Record<string, unknown> {
  return {
    version: version ?? String(scene.index),
    index: scene.index,
    name: scene.name,
    fetched_at: scene.fetchedAt,
    age_seconds: ageSeconds(scene.fetchedAt, now),
    dock: poseOf(scene.dock),
    robot: poseOf(scene.robot),
    unlinked_rooms: scene.unlinkedRooms ?? null,
  };
}

function lastCleanPart(cleans: CleansRead): Record<string, unknown> | null | string {
  if (cleans.status === 'not_loaded') {
    return 'not loaded here; device_read loads it';
  }
  if (cleans.status === 'unavailable') {
    return cleans.reason;
  }
  const last = cleans.last;
  return last === null
    ? null
    : {
        started_at: last.startedAt,
        ended_at: last.endedAt,
        seconds: last.seconds,
        area_m2: roundTo(last.areaM2, DECIMETRE),
        scope: last.scope,
        mode: last.mode,
        rooms: last.rooms.map((room) => room.name),
        outcome: last.outcome,
      };
}

function zonesPart(map: MapRead): readonly Record<string, unknown>[] | null {
  return map.status === 'loaded'
    ? map.scene.zones.map((zone) => ({
        id: zone.id,
        kind: zone.kind,
        points: zone.points.map(pointOf),
      }))
    : null;
}

function cameraPart(source: PartSource): Record<string, unknown> {
  return {
    stream: source.store.cameras.find(source.placed.device.id) !== undefined,
    video_switch: shownOf(source, 'vacuum_video_on'),
  };
}

function readVacuum(source: PartSource, loaded: VacuumLoaded): Record<string, unknown> {
  const values = valuesOf(source);
  const problems = new Problems();
  const rooms = roomsPart(loaded.map, roomsOf(source, problems));
  const known = rooms.flatMap((room) =>
    typeof room['id'] === 'number' && typeof room['name'] === 'string'
      ? [{ id: room['id'], name: room['name'] }]
      : [],
  );
  const result = {
    phase: problems.attempt(() => vacuumPhase(values)),
    status: shownOf(source, 'vacuum_status'),
    cleaning: valueOf(source, 'cleaning') ?? null,
    awake: isVacuumAwake(values),
    battery_percent: values.battery ?? null,
    charging: problems.attempt(() => vacuumChargingState(values)),
    job: jobPart(source, values, known, problems),
    rooms,
    zones: zonesPart(loaded.map),
    station: stationPart(source, values, problems),
    consumables: consumablesPart(source),
    map: mapPart(source, loaded),
    last_clean: lastCleanPart(loaded.cleans),
    camera: cameraPart(source),
  };
  return problems.lines.length === 0 ? result : { ...result, problems: problems.lines };
}

async function loadMap(context: PartContext, deviceId: string): Promise<MapRead> {
  try {
    const reply = await operate(context, 'getVacuumScene', {
      params: { deviceId },
      query: { slot: 'current' },
    });
    const parsed = VACUUM_SCENE_ANSWER.safeParse(reply);
    return parsed.success
      ? { status: 'loaded', scene: parsed.data }
      : { status: 'unavailable', reason: 'The map came back in a shape this hub does not know' };
  } catch (error) {
    if (error instanceof ApiError) {
      return { status: 'unavailable', reason: error.message };
    }
    throw error;
  }
}

async function loadCleans(context: PartContext, deviceId: string): Promise<CleansRead> {
  try {
    const reply = await operate(context, 'listVacuumCleans', {
      params: { deviceId },
      query: { limit: 1 },
    });
    const parsed = API_ENDPOINTS.listVacuumCleans.response.safeParse(reply);
    return parsed.success
      ? { status: 'loaded', last: parsed.data.cleans[0] ?? null }
      : {
          status: 'unavailable',
          reason: 'The clean list came back in a shape this hub does not know',
        };
  } catch (error) {
    if (error instanceof ApiError) {
      return { status: 'unavailable', reason: error.message };
    }
    throw error;
  }
}

export const VACUUM_PART = definePart<VacuumLoaded>({
  part: 'vacuum',
  families: ['vacuum'],
  unloaded: UNLOADED,
  load: async (context, placed) => {
    const [map, cleans] = await Promise.all([
      loadMap(context, placed.device.id),
      loadCleans(context, placed.device.id),
    ]);
    return { map, cleans, now: context.clock.now() };
  },
  read: readVacuum,
});
