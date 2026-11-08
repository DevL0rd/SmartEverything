import {
  API_ENDPOINTS as E,
  ApiError,
  type CapabilityKey,
  type DeviceRow,
  type JsonValue,
  type VacuumPoint,
  type VacuumRestricted,
  type VacuumScene,
  type VacuumSlot,
} from '@smarteverything/domain';
import {
  FLOOR_MATERIAL,
  VacuumCodecError,
  VacuumCommandError,
  decodeRestrictedAreas,
  decodeVirtualWalls,
  roomFloor,
  roomVisibility,
  setRestrictions,
  type FloorMaterial,
  type RestrictedAreaDraft,
  type VacuumCommand,
  type VirtualWallDraft,
} from '@smarteverything/xiaomi';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { vacuumPropertyKey } from '../../vacuum/capabilities';
import { liveRooms } from '../../vacuum/command-service';
import type { MapCache } from '../../vacuum/map-cache';
import type { VacuumMapService } from '../../vacuum/map-service';
import type { VacuumRoomLinks } from '../../vacuum/room-links';
import type { VacuumVideo } from '../../vacuum/video-session';
import type { VacuumCleansRepository } from '../../store/repositories/vacuum-cleans';
import type { Store } from '../../store/store';
import { DONE_REPLY, bound, tagged } from '../router';

export interface VacuumControl {
  readonly value: (deviceId: string, key: CapabilityKey) => JsonValue | undefined;
  readonly run: (deviceId: string, command: VacuumCommand) => Promise<void>;
}

export interface VacuumRouteServices {
  readonly devices: Pick<Store['devices'], 'byId'>;
  readonly scenes: Pick<MapCache, 'latest' | 'robotMap'>;
  readonly maps: Pick<VacuumMapService, 'ensure'>;
  readonly cleans: Pick<VacuumCleansRepository, 'list' | 'get'>;
  readonly control: VacuumControl;
  readonly video: Pick<VacuumVideo, 'open' | 'close'>;
  readonly roomLinks: Pick<VacuumRoomLinks, 'list' | 'link' | 'unlink' | 'decorate'>;
}

type AreasEdit = z.output<typeof E.editVacuumAreas.body>;
type RoomEdit = z.output<typeof E.setVacuumRoomSettings.body>;

const MILLIMETRES_PER_METRE = 1000;
const AREAS_KEY = vacuumPropertyKey('restricted-sweep-areas');
const WALLS_KEY = vacuumPropertyKey('restricted-walls');
const ROOMS_KEY = vacuumPropertyKey('room-information');

const SCENE_VERSION = z.looseObject({
  index: z.number().int(),
  rooms: z.array(
    z.looseObject({
      id: z.number().int(),
      homeRoom: z.object({ id: z.string(), name: z.string() }).nullable(),
    }),
  ),
});

const LINK_TAG_LENGTH = 12;

export function sceneEntityTag(response: unknown): string {
  const { index, rooms } = SCENE_VERSION.parse(response);
  const links = JSON.stringify(rooms.map(({ id, homeRoom }) => [id, homeRoom]));
  const digest = createHash('sha256').update(links).digest('hex').slice(0, LINK_TAG_LENGTH);
  return `${String(index)}-${digest}`;
}

const toMetres = (millimetres: number): number => millimetres / MILLIMETRES_PER_METRE;
const toMillimetres = (metres: number): number => Math.round(metres * MILLIMETRES_PER_METRE);

function vacuumOf(devices: VacuumRouteServices['devices'], deviceId: string): DeviceRow {
  const device = devices.byId(deviceId);
  if (device.kind !== 'vacuum') {
    throw new ApiError('invalid_request', `${device.name} is not a robot vacuum.`);
  }
  return device;
}

function xiaomiVacuumOf(devices: VacuumRouteServices['devices'], deviceId: string): DeviceRow {
  const device = vacuumOf(devices, deviceId);
  if (device.provider !== 'xiaomi') {
    throw new ApiError('invalid_request', `${device.name} cannot change areas or rooms from here.`);
  }
  return device;
}

async function sceneOf(
  services: VacuumRouteServices,
  deviceId: string,
  slot: VacuumSlot,
): Promise<VacuumScene> {
  const held = services.scenes.latest(deviceId, slot);
  if (held !== undefined) return held;
  await services.maps.ensure(deviceId, slot);
  const fetched = services.scenes.latest(deviceId, slot);
  if (fetched === undefined) {
    throw new ApiError('not_found', `The robot has no ${slot} map to show yet.`);
  }
  return fetched;
}

function pairsOf(values: readonly number[]): VacuumPoint[] {
  return values.flatMap((x, index) => {
    const y = values[index + 1];
    return index % 2 === 0 && y !== undefined ? [{ x: toMetres(x), y: toMetres(y) }] : [];
  });
}

function segmentOf(values: readonly number[]): VacuumRestricted['walls'] {
  const [from, to] = pairsOf(values);
  return from === undefined || to === undefined ? [] : [{ from, to }];
}

function textOf(control: VacuumControl, deviceId: string, key: CapabilityKey): string {
  const value = control.value(deviceId, key);
  if (typeof value !== 'string') {
    throw new ApiError('conflict', 'The robot has not reported its restricted areas yet.');
  }
  return value;
}

function restrictedOf(control: VacuumControl, deviceId: string): VacuumRestricted {
  try {
    const areas = decodeRestrictedAreas(textOf(control, deviceId, AREAS_KEY));
    const walls = decodeVirtualWalls(textOf(control, deviceId, WALLS_KEY));
    const ofKind = (kind: 'no-go' | 'no-mop'): VacuumPoint[][] =>
      areas.filter((area) => area.kind === kind).map((area) => pairsOf(area.corners));
    return {
      noGo: ofKind('no-go'),
      noMop: ofKind('no-mop'),
      walls: walls.flatMap((wall) => segmentOf(wall.points)),
    };
  } catch (cause) {
    if (cause instanceof VacuumCodecError) {
      throw new ApiError(
        'upstream_failed',
        `The robot's restricted areas cannot be read: ${cause.message}`,
      );
    }
    throw cause;
  }
}

function cornersOf(area: readonly VacuumPoint[]): number[] {
  return area.flatMap(({ x, y }) => [toMillimetres(x), toMillimetres(y)]);
}

function draftsOf(areas: VacuumRestricted): {
  readonly areas: RestrictedAreaDraft[];
  readonly walls: VirtualWallDraft[];
} {
  return {
    areas: [
      ...areas.noGo.map((area) => ({ corners: cornersOf(area), kind: 'no-go' as const })),
      ...areas.noMop.map((area) => ({ corners: cornersOf(area), kind: 'no-mop' as const })),
    ],
    walls: areas.walls.map(({ from, to }) => ({ points: cornersOf([from, to]) })),
  };
}

function refusedBy(error: unknown): never {
  if (error instanceof VacuumCommandError) {
    throw new ApiError(
      'invalid_request',
      `Expected ${error.expected}, received ${error.received}.`,
    );
  }
  throw error;
}

async function editAreas(
  services: VacuumRouteServices,
  deviceId: string,
  edit: AreasEdit,
): Promise<{ readonly previous: VacuumRestricted }> {
  xiaomiVacuumOf(services.devices, deviceId);
  const previous = restrictedOf(services.control, deviceId);
  const { areas, walls } = draftsOf({
    noGo: edit.noGo ?? previous.noGo,
    noMop: edit.noMop ?? previous.noMop,
    walls: edit.walls ?? previous.walls,
  });
  let command: VacuumCommand;
  try {
    command = setRestrictions(areas, walls);
  } catch (error) {
    return refusedBy(error);
  }
  await services.control.run(deviceId, command);
  return { previous };
}

function isFloorMaterial(key: string): key is FloorMaterial {
  return Object.hasOwn(FLOOR_MATERIAL, key);
}

function materialOf(floor: number): FloorMaterial {
  const found = Object.entries(FLOOR_MATERIAL).flatMap(([key, code]) =>
    isFloorMaterial(key) && code === floor ? [key] : [],
  );
  const [material] = found;
  if (material === undefined) {
    throw new ApiError(
      'invalid_request',
      `Floor ${String(floor)} is not a floor material the robot knows: ${Object.values(FLOOR_MATERIAL).join(', ')}.`,
    );
  }
  return material;
}

function roomCommands(roomId: number, edit: RoomEdit): VacuumCommand[] {
  try {
    return [
      ...(edit.floor === undefined ? [] : [roomFloor(roomId, materialOf(edit.floor))]),
      ...(edit.hidden === undefined ? [] : [roomVisibility(roomId, edit.hidden)]),
    ];
  } catch (error) {
    return refusedBy(error);
  }
}

async function editRoom(
  services: VacuumRouteServices,
  deviceId: string,
  roomId: number,
  edit: RoomEdit,
): Promise<void> {
  xiaomiVacuumOf(services.devices, deviceId);
  const rooms = liveRooms(ROOMS_KEY, services.control.value(deviceId, ROOMS_KEY));
  if (!rooms.some(({ id }) => id === roomId)) {
    throw new ApiError('not_found', `The robot has no room ${String(roomId)}.`);
  }
  for (const command of roomCommands(roomId, edit)) {
    await services.control.run(deviceId, command);
  }
}

const roomLinkRoutes = (services: VacuumRouteServices) =>
  ({
    listVacuumRoomLinks: bound(E.listVacuumRoomLinks, async ({ params }) => {
      vacuumOf(services.devices, params.deviceId);
      const scene = await sceneOf(services, params.deviceId, 'current');
      return services.roomLinks.list(params.deviceId, scene);
    }),
    setVacuumRoomLink: bound(E.setVacuumRoomLink, async ({ params, body }) => {
      vacuumOf(services.devices, params.deviceId);
      const scene = await sceneOf(services, params.deviceId, 'current');
      return services.roomLinks.link(params.deviceId, scene, {
        mapRoomId: params.mapRoomId,
        roomId: body.roomId,
        move: body.move,
      });
    }),
    removeVacuumRoomLink: bound(E.removeVacuumRoomLink, async ({ params }) => {
      vacuumOf(services.devices, params.deviceId);
      const scene = await sceneOf(services, params.deviceId, 'current');
      return services.roomLinks.unlink(params.deviceId, scene, params.mapRoomId);
    }),
  }) as const;

export const vacuumRoutes = (services: VacuumRouteServices) =>
  ({
    getVacuumScene: tagged(
      bound(E.getVacuumScene, async ({ params, query }) => {
        vacuumOf(services.devices, params.deviceId);
        const scene = await sceneOf(services, params.deviceId, query.slot);
        return services.roomLinks.decorate(params.deviceId, scene);
      }),
      sceneEntityTag,
    ),
    listVacuumCleans: bound(E.listVacuumCleans, ({ params, query }) => {
      vacuumOf(services.devices, params.deviceId);
      return {
        cleans: services.cleans.list(params.deviceId, {
          ...(query.before === undefined ? {} : { to: query.before }),
          limit: query.limit,
        }),
      };
    }),
    getVacuumClean: bound(E.getVacuumClean, ({ params }) => {
      vacuumOf(services.devices, params.deviceId);
      const clean = services.cleans.get(params.deviceId, params.cleanId);
      if (clean === undefined) {
        throw new ApiError('not_found', `The robot has no clean ${params.cleanId}.`);
      }
      return clean;
    }),
    editVacuumAreas: bound(E.editVacuumAreas, ({ params, body }) =>
      editAreas(services, params.deviceId, body),
    ),
    setVacuumRoomSettings: bound(E.setVacuumRoomSettings, async ({ params, body }) => {
      await editRoom(services, params.deviceId, params.mapRoomId, body);
      return DONE_REPLY;
    }),
    ...roomLinkRoutes(services),
    openVacuumVideo: bound(E.openVacuumVideo, ({ params, body }) =>
      services.video.open(params.deviceId, body),
    ),
    closeVacuumVideo: bound(E.closeVacuumVideo, async ({ params }) => {
      await services.video.close(params.deviceId);
      return DONE_REPLY;
    }),
  }) as const;
