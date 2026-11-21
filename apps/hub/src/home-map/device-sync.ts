import {
  ApiError,
  FAMILY_PLACEMENT,
  appendTo,
  deviceFamily,
  homeMapAutoPlace,
  homeMapOpeningEnds,
  homeMapPointInPolygon,
  placementFacts,
  type DeviceFamily,
  type DeviceRow,
  type HomeMap,
  type HomeMapActor,
  type HomeMapAutoDevice,
  type HomeMapAutoFacts,
  type HomeMapAutoOccupant,
  type HomeMapAutoRole,
  type HomeMapFloor,
  type HomeMapId,
  type HomeMapOp,
  type HomeMapPlacement,
  type HomeMapRoom,
  type HomeMapSegmentShape,
  type LiveChange,
} from '@smarteverything/domain';
import { background, type Logger } from '@smarteverything/logging';
import type { HomeMapDeviceModel } from './map-units';
import type { HeldMaps, HomeMapService } from './service';

export const DEVICE_SYNC_ACTOR: HomeMapActor = 'source:device-sync';

export interface DeviceSyncPorts {
  readonly maps: Pick<HomeMapService, 'exclusive'>;
  readonly devices: { readonly list: () => readonly DeviceRow[] };
  readonly modelsOf: (devices: readonly DeviceRow[]) => Promise<readonly HomeMapDeviceModel[]>;
  readonly log: Logger;
}

export interface DeviceSyncFeed {
  readonly subscribe: (listener: (change: LiveChange) => void) => () => void;
}

export interface PlaceRequest {
  readonly roomId?: string | undefined;
  readonly deviceIds?: readonly string[] | undefined;
}

export interface PlaceOutcome {
  readonly revision: number;
  readonly placed: number;
}

interface Target {
  readonly floor: HomeMapFloor;
  readonly room: HomeMapRoom;
}

interface Wanted {
  readonly device: DeviceRow;
  readonly target: Target;
}

interface Plan {
  readonly ops: readonly HomeMapOp[];
  readonly placed: number;
}

interface Modelled {
  readonly device: DeviceRow;
  readonly modelId: string | null;
}

type Models = ReadonlyMap<string, Modelled>;

interface OccupantScope {
  readonly floor: HomeMapFloor;
  readonly room: HomeMapRoom;
  readonly skip: ReadonlySet<string>;
  readonly book: FactBook;
  readonly models: Models;
}

const FLOOR_CORNER_FAMILIES: ReadonlySet<DeviceFamily> = new Set([
  'light',
  'fan',
  'tower_fan',
  'air_purifier',
  'humidifier',
  'dehumidifier',
  'heater',
]);

const WALL_ROLES: Readonly<Partial<Record<DeviceFamily, HomeMapAutoRole>>> = {
  television: 'tv',
  switch: 'switch',
  air_conditioner: 'ac',
  camera: 'camera',
};

export function autoFactsOf(modelId: string | null, family: DeviceFamily): HomeMapAutoFacts {
  const known = modelId === null ? undefined : placementFacts(modelId);
  return known ?? FAMILY_PLACEMENT[family];
}

export function autoRoleOf(family: DeviceFamily, facts: HomeMapAutoFacts): HomeMapAutoRole {
  const wall = WALL_ROLES[family];
  if (wall !== undefined) return wall;
  if (facts.fov !== undefined) return 'presence';
  return facts.mount === 'floor' && FLOOR_CORNER_FAMILIES.has(family) ? 'corner' : 'generic';
}

class FactBook {
  private readonly known = new Map<string, HomeMapAutoFacts>();

  add(key: string, facts: HomeMapAutoFacts): string {
    this.known.set(key, facts);
    return key;
  }

  readonly lookup = (key: string): HomeMapAutoFacts => {
    const facts = this.known.get(key);
    if (facts === undefined) {
      throw new ApiError('internal', `Auto placement has no facts for ${key}.`);
    }
    return facts;
  };
}

const placementOf = (
  map: HomeMap,
  deviceId: string,
): { readonly floor: HomeMapFloor; readonly placement: HomeMapPlacement } | null => {
  for (const floor of map.floors) {
    const placement = floor.placements.find((entry) => entry.deviceId === deviceId);
    if (placement !== undefined) return { floor, placement };
  }
  return null;
};

const targetOf = (map: HomeMap, homeRoomId: string | null): Target | null => {
  if (homeRoomId === null) return null;
  for (const floor of map.floors) {
    const room = floor.rooms.find((entry) => entry.homeRoomId === homeRoomId);
    if (room !== undefined) return { floor, room };
  }
  return null;
};

const removeOp = (floorId: string, deviceId: string): HomeMapOp => ({
  op: 'remove',
  kind: 'placement',
  floorId,
  id: deviceId,
});

const addOp = (placement: HomeMapPlacement): HomeMapOp => ({
  op: 'add',
  kind: 'placement',
  floorId: placement.floorId,
  element: placement,
});

const openingSegments = (floor: HomeMapFloor): HomeMapSegmentShape[] =>
  floor.openings.flatMap((opening) => {
    const wall = floor.walls.find((entry) => entry.id === opening.wallId);
    return wall === undefined ? [] : [homeMapOpeningEnds(wall, opening.offset, opening.width)];
  });

const insideTarget = (target: Target, placement: HomeMapPlacement): boolean =>
  placement.floorId === target.floor.id && homeMapPointInPolygon(target.room.polygon, placement.at);

export class HomeMapDeviceSync {
  constructor(private readonly ports: DeviceSyncPorts) {}

  start(feed: DeviceSyncFeed): () => void {
    return feed.subscribe((change) => {
      if (change.table !== 'devices' && change.table !== 'rooms') return;
      background(this.handle(change), 'home_map.device_sync_failed', { table: change.table });
    });
  }

  async handle(change: LiveChange): Promise<void> {
    try {
      await this.ports.maps.exclusive(async (maps) => {
        if (change.table === 'devices') {
          await this.onDevice(maps, change.operation, change.record, change.oldRecord);
        } else if (change.table === 'rooms' && change.operation === 'DELETE' && change.oldRecord) {
          await this.apply(maps, this.roomRemovedOps(maps, change.oldRecord.id));
        }
      });
    } catch (error) {
      this.ports.log.error('home_map.device_sync_failed', {
        table: change.table,
        operation: change.operation,
        error: String(error),
      });
    }
  }

  place(request: PlaceRequest, actor: HomeMapActor, mapId?: HomeMapId): Promise<PlaceOutcome> {
    return this.ports.maps.exclusive(async (maps) => {
      const map = maps.get(mapId);
      const wanted = this.requested(map, request).filter(
        ({ device }) => placementOf(map, device.id) === null,
      );
      const plan = await this.planFor(wanted, new Map());
      const revision =
        plan.ops.length === 0 ? map.revision : await this.apply(maps, plan.ops, actor, mapId);
      return { revision, placed: plan.placed };
    });
  }

  private async onDevice(
    maps: HeldMaps,
    operation: LiveChange['operation'],
    record: DeviceRow | null,
    old: DeviceRow | null,
  ): Promise<void> {
    if (operation === 'DELETE') {
      if (old) await this.apply(maps, this.deviceRemovedOps(maps.get(), old.id));
    } else if (record && (operation === 'INSERT' || old?.room_id !== record.room_id)) {
      await this.followRoom(maps, record);
    }
  }

  private async followRoom(maps: HeldMaps, device: DeviceRow): Promise<void> {
    const map = maps.get();
    const held = placementOf(map, device.id);
    if (held !== null && !held.placement.auto) return;
    const target = targetOf(map, device.room_id);
    if (target === null) {
      await this.apply(maps, this.deviceRemovedOps(map, device.id));
      return;
    }
    if (held !== null && insideTarget(target, held.placement)) return;
    const moves = new Map(held === null ? [] : [[device.id, held.floor.id]]);
    await this.apply(maps, (await this.planFor([{ device, target }], moves)).ops);
  }

  private requested(map: HomeMap, request: PlaceRequest): Wanted[] {
    const ids = request.deviceIds === undefined ? null : new Set(request.deviceIds);
    return this.ports.devices.list().flatMap((device): Wanted[] => {
      if (ids !== null && !ids.has(device.id)) return [];
      if (request.roomId !== undefined && device.room_id !== request.roomId) return [];
      const target = targetOf(map, device.room_id);
      return target === null ? [] : [{ device, target }];
    });
  }

  private async modelsFor(wanted: readonly Wanted[]): Promise<Models> {
    const ids = new Set(wanted.map(({ device }) => device.id));
    for (const { target } of wanted) {
      for (const placement of target.floor.placements) ids.add(placement.deviceId);
    }
    const devices = new Map(
      this.ports.devices
        .list()
        .filter((device) => ids.has(device.id))
        .map((device) => [device.id, device]),
    );
    if (devices.size === 0) return new Map();
    const models = await this.ports.modelsOf([...devices.values()]);
    return new Map(
      models.flatMap((entry): [string, Modelled][] => {
        const device = devices.get(entry.deviceId);
        return device === undefined ? [] : [[entry.deviceId, { device, modelId: entry.modelId }]];
      }),
    );
  }

  private async planFor(
    wanted: readonly Wanted[],
    moves: ReadonlyMap<string, string>,
  ): Promise<Plan> {
    const models = await this.modelsFor(wanted);
    const groups = new Map<string, Wanted[]>();
    for (const entry of wanted) appendTo(groups, entry.target.room.id, entry);
    const adds: HomeMapOp[] = [];
    for (const group of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      adds.push(...this.placeGroup(group[1], models).map(addOp));
    }
    const removes = [...moves].map(([deviceId, floorId]) => removeOp(floorId, deviceId));
    return { ops: [...removes, ...adds], placed: adds.length };
  }

  private placeGroup(group: readonly Wanted[], models: Models): HomeMapPlacement[] {
    const first = group[0];
    if (first === undefined) return [];
    const { floor, room } = first.target;
    const book = new FactBook();
    const skip = new Set(group.map(({ device }) => device.id));
    const devices = group.map(({ device }) => this.described(book, device, models));
    const result = homeMapAutoPlace({
      floorId: floor.id,
      room: { polygon: room.polygon, ceilingHeight: room.ceilingHeight ?? floor.ceilingHeight },
      openings: openingSegments(floor),
      occupants: this.occupants({ floor, room, skip, book, models }),
      devices,
      facts: book.lookup,
    });
    for (const deviceId of result.unplaced) {
      this.ports.log.info('home_map.device_unplaced', { deviceId, roomId: room.id });
    }
    return [...result.placements];
  }

  private described(book: FactBook, device: DeviceRow, models: Models): HomeMapAutoDevice {
    const family = deviceFamily(device);
    const modelled = models.get(device.id);
    if (modelled === undefined) {
      throw new ApiError('internal', `Auto placement has no model answer for ${device.id}.`);
    }
    const facts = autoFactsOf(modelled.modelId, family);
    return {
      deviceId: device.id,
      modelId: book.add(device.id, facts),
      role: autoRoleOf(family, facts),
    };
  }

  private occupants(scope: OccupantScope): HomeMapAutoOccupant[] {
    const { floor, room, skip, book, models } = scope;
    const furniture = floor.objects.flatMap((object): HomeMapAutoOccupant[] => {
      if (!homeMapPointInPolygon(room.polygon, object.at)) return [];
      const facts = placementFacts(object.modelId);
      if (facts === undefined) {
        this.ports.log.warn('home_map.device_sync_unknown_object', { modelId: object.modelId });
        return [];
      }
      const modelId = book.add(`model:${object.modelId}`, facts);
      return [{ modelId, at: object.at, rotation: object.rotation }];
    });
    const placed = floor.placements.flatMap((placement): HomeMapAutoOccupant[] => {
      const device = models.get(placement.deviceId)?.device;
      if (!device || skip.has(device.id)) return [];
      if (!homeMapPointInPolygon(room.polygon, placement.at)) return [];
      const modelId = this.described(book, device, models).modelId;
      return [{ modelId, at: placement.at, rotation: placement.rotation }];
    });
    return [...furniture, ...placed];
  }

  private deviceRemovedOps(map: HomeMap, deviceId: string): HomeMapOp[] {
    const held = placementOf(map, deviceId);
    return held === null ? [] : [removeOp(held.floor.id, deviceId)];
  }

  private roomRemovedOps(maps: HeldMaps, homeRoomId: string): HomeMapOp[] {
    return maps.get().floors.flatMap((floor) =>
      floor.rooms
        .filter((room) => room.homeRoomId === homeRoomId)
        .map((room): HomeMapOp => ({
          op: 'update',
          kind: 'room',
          floorId: floor.id,
          id: room.id,
          patch: { homeRoomId: null },
        })),
    );
  }

  private async apply(
    maps: HeldMaps,
    ops: readonly HomeMapOp[],
    actor: HomeMapActor = DEVICE_SYNC_ACTOR,
    mapId?: HomeMapId,
  ): Promise<number> {
    if (ops.length === 0) return maps.get(mapId).revision;
    const result = await maps.apply(ops, actor, {}, mapId);
    if (result.conflicts.length > 0) {
      this.ports.log.warn('home_map.device_sync_conflicts', { conflicts: result.conflicts.length });
    }
    this.ports.log.info('home_map.device_sync_applied', {
      revision: result.revision,
      ops: result.applied.length,
    });
    return result.revision;
  }
}
