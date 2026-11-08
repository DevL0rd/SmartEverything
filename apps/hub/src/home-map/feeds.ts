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
import type { Logger } from '@smarteverything/logging';
import type { HomeMapSourceLocation } from '../store/repositories/home-maps';
import type { StoredRoomLink } from '../store/repositories/vacuum-room-links';
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
import type { HomeMapService } from './service';

export type FeedSource = Pick<
  XiaomiVacuumSource,
  'kind' | 'devicesOf' | 'robotMaps' | 'currentMap' | 'readMap' | 'onMapChange'
>;

export interface FeedPorts {
  readonly source: FeedSource;
  readonly maps: Pick<HomeMapService, 'get' | 'apply'>;
  readonly sets: {
    readonly ids: () => readonly HomeMapId[];
    readonly defaultId: () => HomeMapId | null;
    readonly locations: (deviceId: string) => readonly HomeMapSourceLocation[];
  };
  readonly inventory: () => SourceInventory;
  readonly atomically: <T>(work: () => T) => T;
  readonly links: { readonly list: (deviceId: string) => readonly StoredRoomLink[] };
  readonly syncLinks: (deviceId: string) => number;
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

export class RobotMapFeeds {
  private readonly watched = new Map<string, () => void>();
  private readonly seen = new Map<string, Map<number, string>>();
  private readonly announced = new Set<string>();

  constructor(private readonly ports: FeedPorts) {}

  watch(inventory: SourceInventory): void {
    const devices = new Set(this.ports.source.devicesOf(inventory));
    for (const [deviceId, release] of this.watched) {
      if (devices.has(deviceId)) continue;
      release();
      this.watched.delete(deviceId);
      this.seen.delete(deviceId);
    }
    for (const deviceId of devices) {
      if (this.watched.has(deviceId)) continue;
      this.watched.set(
        deviceId,
        this.ports.source.onMapChange(deviceId, (change) => {
          this.follow(change.deviceId, change.robotMapId);
        }),
      );
      for (const { robotMapId } of this.ports.source.robotMaps(deviceId)) {
        this.follow(deviceId, robotMapId);
      }
    }
  }

  stop(): void {
    for (const release of this.watched.values()) release();
    this.watched.clear();
    this.seen.clear();
  }

  follow(deviceId: string, robotMapId: number): FeedStatus | 'failed' {
    try {
      return this.route(deviceId, robotMapId);
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
      .flatMap((deviceId) => this.feedsOf(deviceId));
  }

  setFeed(
    deviceId: string,
    robotMapId: number,
    assignment: HomeMapFeedAssignment,
    actor: HomeMapActor,
  ): HomeMapFeed {
    const ref = this.refOf(deviceId, robotMapId);
    const held = this.locationOf(deviceId, robotMapId, ref.isCurrent);
    const released = 'target' in assignment;
    const version = this.ports.atomically(() =>
      released
        ? this.release(deviceId, robotMapId, held, actor)
        : this.assign({ deviceId, robotMapId, ref, held, target: assignment, actor }),
    );
    this.announced.add(newRobotMapNoticeId(deviceId, robotMapId));
    if (released) this.seenOf(deviceId).delete(robotMapId);
    if (version !== null) {
      this.seenOf(deviceId).set(robotMapId, version);
      if (ref.isCurrent) this.ports.syncLinks(deviceId);
    }
    return this.feedOf(deviceId, robotMapId);
  }

  private route(deviceId: string, robotMapId: number): FeedStatus {
    const geometry = this.ports.source.readMap(deviceId, robotMapId);
    if (geometry === null) return 'not_ready';
    if (this.seenOf(deviceId).get(robotMapId) === geometry.version) return 'duplicate';
    const ref = this.refFor(deviceId, robotMapId);
    const held = this.locationOf(deviceId, robotMapId, ref?.isCurrent === true);
    if (held === undefined) return this.unfed(deviceId, robotMapId, ref);
    const status = this.merge(held, { deviceId, robotMapId, geometry, ref });
    this.seenOf(deviceId).set(robotMapId, geometry.version);
    return status;
  }

  private merge(held: HomeMapSourceLocation, routed: Routed): FeedStatus {
    const { source: stored, mapId } = held;
    const map = this.ports.maps.get(mapId);
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
    const result = this.ports.maps.apply(ops, actor, {}, mapId);
    this.noteBound(stored, routed);
    if (routed.ref?.isCurrent === true) this.ports.syncLinks(routed.deviceId);
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

  private unfed(deviceId: string, robotMapId: number, ref: RobotMapRef | undefined): FeedStatus {
    if (this.ports.sets.ids().length === 0) return 'no_map';
    const elementId = newRobotMapNoticeId(deviceId, robotMapId);
    if (this.announced.has(elementId)) return 'already_announced';
    this.announced.add(elementId);
    if (noticeClearOps(this.ports.maps.get(), elementId).length > 0) return 'already_announced';
    const name = ref === undefined || ref.name === '' ? `Map ${String(robotMapId)}` : ref.name;
    const element = HOME_MAP_NOTICE_WRITE.parse({
      id: this.ports.newId(),
      kind: 'source_new_robot_map',
      elementId,
      detail: name,
      createdAt: this.ports.now(),
    });
    this.ports.maps.apply([{ op: 'add', kind: 'notice', element }], `source:${deviceId}`);
    this.ports.log.info('home_map.new_robot_map', { deviceId, robotMapId });
    return 'announced';
  }

  private release(
    deviceId: string,
    robotMapId: number,
    held: HomeMapSourceLocation | undefined,
    actor: HomeMapActor,
  ): null {
    const batches: OpBatches = new Map();
    if (held !== undefined) this.detach(batches, held);
    this.write(batches, newRobotMapNoticeId(deviceId, robotMapId), actor);
    this.ports.log.info('home_map.feed_released', { deviceId, robotMapId });
    return null;
  }

  private assign(ctx: Assigned): string | null {
    const { deviceId, robotMapId, held, target, actor } = ctx;
    const destination = this.ports.maps.get(target.mapId);
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
    if (held !== undefined) this.detach(batches, held);
    addToBatch(batches, target.mapId, this.arrivalOps(destination, ctx, geometry));
    const results = this.write(batches, newRobotMapNoticeId(deviceId, robotMapId), actor);
    if (results.get(target.mapId)?.conflicts.some((entry) => entry.kind === 'source') === true) {
      throw new ApiError('conflict', 'The robot map cannot feed that floor.');
    }
    this.ports.log.info('home_map.feed_set', {
      deviceId,
      robotMapId,
      mapId: target.mapId,
      floorId: target.floorId,
      moved: held !== undefined,
    });
    return geometry.version;
  }

  private arrivalOps(
    destination: HomeMap,
    ctx: Assigned,
    geometry: HomeMapSourceGeometry,
  ): readonly HomeMapOp[] {
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
      ? withLinkedRooms(plan.ops, this.ports.links.list(deviceId))
      : plan.ops;
    const named = withRobotMap(linked, { robotMapId, name: ref.name === '' ? null : ref.name });
    const placed = this.ports.sets
      .ids()
      .some((mapId) => placedAnywhere(this.ports.maps.get(mapId), deviceId));
    return placed ? withoutPlacedDevice(named, deviceId) : named;
  }

  private detach(batches: OpBatches, held: HomeMapSourceLocation): void {
    const map = this.ports.maps.get(held.mapId);
    addToBatch(batches, held.mapId, detachOps(map, held.source));
  }

  private write(
    batches: OpBatches,
    noticeId: string,
    actor: HomeMapActor,
  ): Map<HomeMapId, ReturnType<HomeMapService['apply']>> {
    const defaultId = this.ports.sets.defaultId();
    if (defaultId !== null) {
      addToBatch(batches, defaultId, noticeClearOps(this.ports.maps.get(defaultId), noticeId));
    }
    const results = new Map<HomeMapId, ReturnType<HomeMapService['apply']>>();
    for (const [mapId, ops] of batches) {
      results.set(mapId, this.ports.maps.apply(ops, actor, {}, mapId));
    }
    return results;
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

  private refOf(deviceId: string, robotMapId: number): RobotMapRef {
    if (!this.ports.source.devicesOf(this.ports.inventory()).includes(deviceId)) {
      throw new ApiError('not_found', 'That device has no robot maps.');
    }
    const found = this.refFor(deviceId, robotMapId);
    if (found !== undefined) return found;
    const orphan = this.ports.sets
      .locations(deviceId)
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
    deviceId: string,
    robotMapId: number,
    isCurrent: boolean,
  ): HomeMapSourceLocation | undefined {
    return locationFor(this.ports.sets.locations(deviceId), robotMapId, isCurrent);
  }

  private seenOf(deviceId: string): Map<number, string> {
    const held = this.seen.get(deviceId) ?? new Map<number, string>();
    this.seen.set(deviceId, held);
    return held;
  }

  private feedsOf(deviceId: string): HomeMapFeed[] {
    return feedsFor(
      deviceId,
      this.ports.source.robotMaps(deviceId),
      this.ports.sets.locations(deviceId),
    );
  }

  private feedOf(deviceId: string, robotMapId: number): HomeMapFeed {
    const found = this.feedsOf(deviceId).find((feed) => feed.robotMapId === robotMapId);
    if (found === undefined) throw new ApiError('not_found', 'The robot has no such map.');
    return found;
  }
}
