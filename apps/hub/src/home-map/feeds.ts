import {
  ApiError,
  HOME_MAP_NOTICE_WRITE,
  type HomeMap,
  type HomeMapActor,
  type HomeMapFeed,
  type HomeMapFeedAssignment,
  type HomeMapFeedTarget,
  type HomeMapId,
  type HomeMapOp,
  type HomeMapSource,
  type HomeMapSourceGeometry,
} from '@smarteverything/domain';
import { background, type Logger } from '@smarteverything/logging';
import type { HomeMapApplied, HomeMapSourceLocation } from '../store/repositories/home-maps';
import {
  addToBatch,
  awaitsAlignment,
  detachOps,
  feedsFor,
  identityPatch,
  locationFor,
  newRobotMapNoticeId,
  noticeClearOps,
  placedAnywhere,
  withRobotMap,
  withoutPlacedDevice,
  type OpBatches,
} from './feed-ops';
import { alignFrameCheck } from './merge/align';
import { planImport } from './merge/pipeline';
import { planArrival } from './feed-arrival';
import { withLinkedRooms } from './room-links';
import type { SourceInventory } from './sources/registry';
import type { XiaomiVacuumSource } from './sources/xiaomi-vacuum';
import type { HomeMapRoomLinkStore } from './map-store';
import type { HeldMaps, HomeMapService } from './service';

export type FeedSource = Pick<
  XiaomiVacuumSource,
  'kind' | 'devicesOf' | 'robotMaps' | 'currentMap' | 'readMap' | 'onMapChange'
>;

export interface FeedPorts {
  readonly source: FeedSource;
  readonly maps: Pick<HomeMapService, 'exclusive' | 'sourceLocations'>;
  readonly inventory: () => SourceInventory;
  readonly links: HomeMapRoomLinkStore;
  readonly syncLinks: (held: HeldMaps, deviceId: string) => Promise<number>;
  readonly newId: () => string;
  readonly now: () => string;
  readonly log: Logger;
}

export type FeedStatus =
  | 'imported'
  | 'unchanged'
  | 'duplicate'
  | 'not_ready'
  | 'no_map'
  | 'announced'
  | 'already_announced';

interface RobotMapRef {
  readonly name: string;
  readonly isCurrent: boolean;
}

interface Routed {
  readonly deviceId: string;
  readonly robotMapId: number;
  readonly geometry: HomeMapSourceGeometry;
  readonly ref: RobotMapRef | undefined;
}

interface Assigned {
  readonly deviceId: string;
  readonly robotMapId: number;
  readonly ref: RobotMapRef;
  readonly held: HomeMapSourceLocation | undefined;
  readonly target: HomeMapFeedTarget;
  readonly actor: HomeMapActor;
}

interface RobotMapKey {
  readonly deviceId: string;
  readonly robotMapId: number;
}

interface Writing {
  readonly noticeId: string;
  readonly actor: HomeMapActor;
  readonly refuseSourceConflictOn?: HomeMapId;
}

export class RobotMapFeeds {
  private readonly watched = new Map<string, () => void>();
  private readonly seen = new Map<string, Map<number, string>>();
  private readonly announced = new Set<string>();

  constructor(private readonly ports: FeedPorts) {}

  async watch(inventory: SourceInventory): Promise<void> {
    const devices = new Set(this.ports.source.devicesOf(inventory));
    for (const [deviceId, release] of this.watched) {
      if (devices.has(deviceId)) continue;
      release();
      this.watched.delete(deviceId);
      this.seen.delete(deviceId);
    }
    const followed: Promise<FeedStatus | 'failed'>[] = [];
    for (const deviceId of devices) {
      if (this.watched.has(deviceId)) continue;
      this.watched.set(
        deviceId,
        this.ports.source.onMapChange(deviceId, (change) => {
          background(
            this.follow(change.deviceId, change.robotMapId),
            'home_map.feed_import_failed',
            { deviceId: change.deviceId, robotMapId: change.robotMapId },
          );
        }),
      );
      for (const { robotMapId } of this.ports.source.robotMaps(deviceId)) {
        followed.push(this.follow(deviceId, robotMapId));
      }
    }
    await Promise.all(followed);
  }

  stop(): void {
    for (const release of this.watched.values()) release();
    this.watched.clear();
    this.seen.clear();
  }

  async follow(deviceId: string, robotMapId: number): Promise<FeedStatus | 'failed'> {
    try {
      return await this.ports.maps.exclusive((maps) => this.route(maps, deviceId, robotMapId));
    } catch (error) {
      this.ports.log.error('home_map.feed_import_failed', {
        deviceId,
        robotMapId,
        error: String(error),
      });
      return 'failed';
    }
  }

  list(): HomeMapFeed[] {
    return this.ports.source
      .devicesOf(this.ports.inventory())
      .flatMap((deviceId) => this.feedsOf(deviceId, this.ports.maps.sourceLocations(deviceId)));
  }

  setFeed(
    deviceId: string,
    robotMapId: number,
    assignment: HomeMapFeedAssignment,
    actor: HomeMapActor,
  ): Promise<HomeMapFeed> {
    return this.ports.maps.exclusive(async (maps) => {
      const ref = this.refOf(maps, deviceId, robotMapId);
      const held = this.locationOf(maps, deviceId, robotMapId, ref.isCurrent);
      const released = 'target' in assignment;
      const version = released
        ? await this.release(maps, { deviceId, robotMapId }, held, actor)
        : await this.assign(maps, { deviceId, robotMapId, ref, held, target: assignment, actor });
      this.announced.add(newRobotMapNoticeId(deviceId, robotMapId));
      if (released) this.seenOf(deviceId).delete(robotMapId);
      if (version !== null) {
        this.seenOf(deviceId).set(robotMapId, version);
        if (ref.isCurrent) await this.ports.syncLinks(maps, deviceId);
      }
      return this.feedOf(maps, deviceId, robotMapId);
    });
  }

  private async route(maps: HeldMaps, deviceId: string, robotMapId: number): Promise<FeedStatus> {
    const geometry = this.ports.source.readMap(deviceId, robotMapId);
    if (geometry === null) return 'not_ready';
    if (this.seenOf(deviceId).get(robotMapId) === geometry.version) return 'duplicate';
    const ref = this.refFor(deviceId, robotMapId);
    const held = this.locationOf(maps, deviceId, robotMapId, ref?.isCurrent === true);
    if (held === undefined) return this.unfed(maps, deviceId, robotMapId, ref);
    const status = await this.merge(maps, held, { deviceId, robotMapId, geometry, ref });
    this.seenOf(deviceId).set(robotMapId, geometry.version);
    return status;
  }

  private async merge(
    maps: HeldMaps,
    held: HomeMapSourceLocation,
    routed: Routed,
  ): Promise<FeedStatus> {
    const { source: stored, mapId } = held;
    const map = maps.get(mapId);
    if (awaitsAlignment(map, stored)) return 'unchanged';
    const plan = planImport({
      map,
      geometry: routed.geometry,
      sourceKind: this.ports.source.kind,
      sourceId: stored.id,
      deviceId: routed.deviceId,
      floorId: stored.floorId,
      importedAt: this.ports.now(),
      newId: this.ports.newId,
      frameCheck: alignFrameCheck,
    });
    const patch = identityPatch(stored, routed.robotMapId, routed.ref?.name);
    const bind: readonly HomeMapOp[] =
      patch === null ? [] : [{ op: 'update', kind: 'source', id: stored.id, patch }];
    const ops = plan.kind === 'noop' ? bind : [...bind, ...plan.ops];
    if (ops.length === 0) return 'unchanged';
    const actor = plan.kind === 'noop' ? `source:${stored.id}` : plan.actor;
    const result = await maps.apply(ops, actor, {}, mapId);
    this.noteBound(stored, routed);
    if (routed.ref?.isCurrent === true) await this.ports.syncLinks(maps, routed.deviceId);
    return result.applied.length > 0 ? 'imported' : 'unchanged';
  }

  private noteBound(stored: HomeMapSource, routed: Routed): void {
    if (stored.robotMapId !== undefined) return;
    this.ports.log.info('home_map.source_bound', {
      deviceId: routed.deviceId,
      robotMapId: routed.robotMapId,
      sourceId: stored.id,
    });
  }

  private async unfed(
    maps: HeldMaps,
    deviceId: string,
    robotMapId: number,
    ref: RobotMapRef | undefined,
  ): Promise<FeedStatus> {
    if (maps.ids().length === 0) return 'no_map';
    const elementId = newRobotMapNoticeId(deviceId, robotMapId);
    if (this.announced.has(elementId)) return 'already_announced';
    this.announced.add(elementId);
    if (noticeClearOps(maps.get(), elementId).length > 0) return 'already_announced';
    const name = ref === undefined || ref.name === '' ? `Map ${String(robotMapId)}` : ref.name;
    const element = HOME_MAP_NOTICE_WRITE.parse({
      id: this.ports.newId(),
      kind: 'source_new_robot_map',
      elementId,
      detail: name,
      createdAt: this.ports.now(),
    });
    await maps.apply([{ op: 'add', kind: 'notice', element }], `source:${deviceId}`);
    this.ports.log.info('home_map.new_robot_map', { deviceId, robotMapId });
    return 'announced';
  }

  private async release(
    maps: HeldMaps,
    { deviceId, robotMapId }: RobotMapKey,
    held: HomeMapSourceLocation | undefined,
    actor: HomeMapActor,
  ): Promise<null> {
    const batches: OpBatches = new Map();
    if (held !== undefined) this.detach(maps, batches, held);
    await this.write(maps, batches, { noticeId: newRobotMapNoticeId(deviceId, robotMapId), actor });
    this.ports.log.info('home_map.feed_released', { deviceId, robotMapId });
    return null;
  }

  private async assign(maps: HeldMaps, ctx: Assigned): Promise<string | null> {
    const { deviceId, robotMapId, held, target, actor } = ctx;
    const destination = maps.get(target.mapId);
    this.ensureFloor(destination, target);
    if (held?.mapId === target.mapId && held.source.floorId === target.floorId) return null;
    const geometry = this.ports.source.readMap(deviceId, robotMapId);
    if (geometry === null) {
      throw new ApiError(
        'conflict',
        'The robot has not finished this map yet. Choose its floor when the robot is done.',
      );
    }
    this.ensureFloorFree(destination, ctx);
    const batches: OpBatches = new Map();
    if (held !== undefined) this.detach(maps, batches, held);
    addToBatch(batches, target.mapId, await this.arrivalOps(maps, destination, ctx, geometry));
    await this.write(maps, batches, {
      noticeId: newRobotMapNoticeId(deviceId, robotMapId),
      actor,
      refuseSourceConflictOn: target.mapId,
    });
    this.ports.log.info('home_map.feed_set', {
      deviceId,
      robotMapId,
      mapId: target.mapId,
      floorId: target.floorId,
      moved: held !== undefined,
    });
    return geometry.version;
  }

  private async arrivalOps(
    maps: HeldMaps,
    destination: HomeMap,
    ctx: Assigned,
    geometry: HomeMapSourceGeometry,
  ): Promise<readonly HomeMapOp[]> {
    const { deviceId, robotMapId, ref, target } = ctx;
    const plan = planArrival({
      map: destination,
      geometry,
      sourceKind: this.ports.source.kind,
      sourceId: this.ports.newId(),
      deviceId,
      floorId: target.floorId,
      importedAt: this.ports.now(),
      newId: this.ports.newId,
      frameCheck: alignFrameCheck,
    });
    if (plan.kind === 'refused')
      this.ports.log.warn('home_map.feed_refused', { deviceId, robotMapId });
    const linked = ref.isCurrent
      ? withLinkedRooms(plan.ops, await this.ports.links.list(deviceId))
      : plan.ops;
    const named = withRobotMap(linked, { robotMapId, name: ref.name === '' ? null : ref.name });
    const placed = maps.ids().some((mapId) => placedAnywhere(maps.get(mapId), deviceId));
    return placed ? withoutPlacedDevice(named, deviceId) : named;
  }

  private detach(maps: HeldMaps, batches: OpBatches, held: HomeMapSourceLocation): void {
    const map = maps.get(held.mapId);
    addToBatch(batches, held.mapId, detachOps(map, held.source));
  }

  private async write(
    maps: HeldMaps,
    batches: OpBatches,
    writing: Writing,
  ): Promise<readonly HomeMapApplied[]> {
    const defaultId = maps.defaultId();
    if (defaultId !== null) {
      addToBatch(batches, defaultId, noticeClearOps(maps.get(defaultId), writing.noticeId));
    }
    return maps.applyAll(
      [...batches].map(([mapId, ops]) => ({ mapId, ops })),
      writing.actor,
      writing.refuseSourceConflictOn ?? null,
    );
  }

  private ensureFloor(destination: HomeMap, target: HomeMapFeedTarget): void {
    if (destination.floors.some((floor) => floor.id === target.floorId)) return;
    throw new ApiError('not_found', `There is no floor ${target.floorId} on map ${target.mapId}.`);
  }

  private ensureFloorFree(destination: HomeMap, ctx: Assigned): void {
    const taken = destination.sources.some(
      (entry) =>
        entry.deviceId === ctx.deviceId &&
        entry.floorId === ctx.target.floorId &&
        entry.id !== ctx.held?.source.id,
    );
    if (taken) {
      throw new ApiError('conflict', 'Another map of this robot already feeds that floor.');
    }
  }

  private refOf(maps: HeldMaps, deviceId: string, robotMapId: number): RobotMapRef {
    if (!this.ports.source.devicesOf(this.ports.inventory()).includes(deviceId)) {
      throw new ApiError('not_found', 'That device has no robot maps.');
    }
    const found = this.refFor(deviceId, robotMapId);
    if (found !== undefined) return found;
    const orphan = maps
      .sourceLocations(deviceId)
      .find((entry) => entry.source.robotMapId === robotMapId);
    if (orphan === undefined) throw new ApiError('not_found', 'The robot has no such map.');
    return { name: orphan.source.robotMapName ?? '', isCurrent: false };
  }

  private refFor(deviceId: string, robotMapId: number): RobotMapRef | undefined {
    const current = this.ports.source.currentMap(deviceId);
    const isCurrent = current?.robotMapId === robotMapId;
    const listed = this.ports.source
      .robotMaps(deviceId)
      .find((entry) => entry.robotMapId === robotMapId);
    if (listed !== undefined) return { name: listed.name, isCurrent };
    return isCurrent ? { name: current.name ?? '', isCurrent } : undefined;
  }

  private locationOf(
    maps: HeldMaps,
    deviceId: string,
    robotMapId: number,
    isCurrent: boolean,
  ): HomeMapSourceLocation | undefined {
    return locationFor(maps.sourceLocations(deviceId), robotMapId, isCurrent);
  }

  private seenOf(deviceId: string): Map<number, string> {
    const held = this.seen.get(deviceId) ?? new Map<number, string>();
    this.seen.set(deviceId, held);
    return held;
  }

  private feedsOf(deviceId: string, locations: readonly HomeMapSourceLocation[]): HomeMapFeed[] {
    return feedsFor(deviceId, this.ports.source.robotMaps(deviceId), locations);
  }

  private feedOf(maps: HeldMaps, deviceId: string, robotMapId: number): HomeMapFeed {
    const found = this.feedsOf(deviceId, maps.sourceLocations(deviceId)).find(
      (feed) => feed.robotMapId === robotMapId,
    );
    if (found === undefined) throw new ApiError('not_found', 'The robot has no such map.');
    return found;
  }
}
