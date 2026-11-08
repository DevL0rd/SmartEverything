import { randomUUID } from 'node:crypto';
import {
  ApiError,
  VACUUM_MAP_KEY,
  VACUUM_ROOM_LINKS_KEY,
  VACUUM_SAVED_MAPS_KEY,
  createModelCatalog,
  placementFacts,
  type DeviceRow,
  type HomeMapActor,
  type HomeMapOp,
  type HomeMapSourceGeometry,
  type LiveChange,
  type ModelCatalog,
  type VacuumScene,
} from '@smarteverything/domain';
import { background, type Logger } from '@smarteverything/logging';
import { FLOOR_MATERIAL, roomFloor, type FloorMaterial } from '@smarteverything/xiaomi';
import type { BuildOptions } from '../server/build';
import type { MapCache } from '../vacuum/map-cache';
import type { ServerContext } from '../server/context';
import type { VacuumRouteServices } from '../server/handlers/vacuums';
import type { Store } from '../store/store';
import { resolveDeviceModel } from '../server/handlers/models';
import { modelRouteServices } from '../server/handlers/model-assets';
import type { HomeMapApplied } from '../store/repositories/home-maps';
import type { StoredRoomLink } from '../store/repositories/vacuum-room-links';
import { vacuumPropertyKey } from '../vacuum/capabilities';
import { HomeMapAutoCreate } from './auto-create';
import { HomeMapDeviceSync } from './device-sync';
import { RobotMapFeeds } from './feeds';
import { HomeMapSet } from './map-set';
import { HomeMapReset } from './reset';
import { HomeMapRoomLinks } from './room-links';
import { nodeScanPorts, ScanStore } from './scan-store';
import { HomeMapService } from './service';
import { HomeMapSourceImports } from './source-import';
import { MapSourceRegistry } from './sources/registry';
import { XiaomiVacuumSource } from './sources/xiaomi-vacuum';
import { HomeMapVersions } from './versions';

export interface HomeMapRuntime {
  readonly service: HomeMapService;
  readonly vacuum: XiaomiVacuumSource;
  readonly imports: HomeMapSourceImports;
  readonly autoCreate: HomeMapAutoCreate;
  readonly roomLinks: HomeMapRoomLinks;
  readonly devices: HomeMapDeviceSync;
  readonly catalogue: Catalogue;
  readonly set: HomeMapSet;
  readonly versions: HomeMapVersions;
  readonly reset: HomeMapReset;
  readonly feeds: RobotMapFeeds;
  readonly scans: ScanStore;
  readonly scene: (deviceId: string) => VacuumScene | undefined;
}

type Applied = (result: HomeMapApplied, actor: HomeMapActor) => void;

const STATUS_KEY = vacuumPropertyKey('status');

export class Catalogue {
  private held: ModelCatalog;

  constructor(private readonly load: () => ModelCatalog) {
    this.held = load();
  }

  refresh(): void {
    this.held = this.load();
  }

  known(modelId: string): boolean {
    return this.held.find(modelId) !== undefined || placementFacts(modelId) !== undefined;
  }

  nameOf(modelId: string): string {
    return this.held.find(modelId)?.title ?? modelId;
  }
}

function isFloorMaterial(key: string): key is FloorMaterial {
  return Object.hasOwn(FLOOR_MATERIAL, key);
}

function materialOf(code: number): FloorMaterial {
  for (const [key, value] of Object.entries(FLOOR_MATERIAL)) {
    if (isFloorMaterial(key) && value === code) return key;
  }
  throw new ApiError('invalid_request', `Floor ${String(code)} is not a floor the robot knows.`);
}

function serviceOf(
  store: Store,
  catalogue: Catalogue,
  hooks: readonly Applied[],
  log: Logger,
): HomeMapService {
  return new HomeMapService({
    maps: {
      read: (mapId) => store.homeMaps.read(mapId),
      revisions: (filter) => store.homeMaps.revisions(filter),
      apply: (ops: readonly HomeMapOp[], actor, mark, mapId): HomeMapApplied => {
        const result = store.homeMaps.apply(ops, actor, mark, mapId);
        if (result.applied.length > 0) for (const hook of hooks) hook(result, actor);
        return result;
      },
    },
    knownModel: (modelId) => catalogue.known(modelId),
    log,
  });
}

export interface HomeMapSeams {
  readonly store: Store;
  readonly vacuums: {
    readonly scenes: Pick<MapCache, 'latest' | 'robotMap'>;
    readonly control: VacuumRouteServices['control'];
  };
  readonly scansDirectory: string;
  readonly now: () => Date;
  readonly log: Logger;
}

function deviceSyncOf(seams: HomeMapSeams, service: HomeMapService): HomeMapDeviceSync {
  const models = modelRouteServices(seams.store);
  return new HomeMapDeviceSync({
    maps: service,
    devices: seams.store.devices,
    modelOf: (device: DeviceRow): string | null => {
      const { main } = resolveDeviceModel(models, device).resolution;
      return main?.kind === 'catalogue' ? main.modelId : null;
    },
    log: seams.log,
  });
}

interface Wiring {
  readonly seams: HomeMapSeams;
  readonly service: HomeMapService;
  readonly vacuum: XiaomiVacuumSource;
  readonly roomLinks: HomeMapRoomLinks;
  readonly scans: ScanStore;
  readonly newId: () => string;
  readonly now: () => string;
}

function mapSetOf({ seams, service, scans }: Wiring): HomeMapSet {
  return new HomeMapSet({
    sets: seams.store.homeMaps,
    maps: service,
    removeScan: (mapId): void => {
      scans.removeAll(mapId);
    },
    log: seams.log,
  });
}

function versionsOf({ seams, service }: Wiring): HomeMapVersions {
  return new HomeMapVersions({
    versions: seams.store.homeMapVersions,
    maps: service,
    mapIds: () => seams.store.homeMaps.ids(),
    log: seams.log,
  });
}

function resetOf({ seams, service, vacuum, newId }: Wiring): HomeMapReset {
  return new HomeMapReset({
    maps: service,
    geometryOf: (source): HomeMapSourceGeometry | null =>
      source.robotMapId === undefined
        ? vacuum.read(source.deviceId)
        : vacuum.readMap(source.deviceId, source.robotMapId),
    newId,
    log: seams.log,
  });
}

function feedsOf({ seams, service, vacuum, roomLinks, newId, now }: Wiring): RobotMapFeeds {
  const { store } = seams;
  return new RobotMapFeeds({
    source: vacuum,
    maps: service,
    sets: {
      ids: () => store.homeMaps.ids(),
      defaultId: () => store.homeMaps.defaultId(),
      locations: (deviceId) => store.homeMaps.sourceLocations(deviceId),
    },
    inventory: () => store.devices.list(),
    atomically: (work) => store.write(work),
    links: { list: (deviceId) => store.vacuumRoomLinks.list(deviceId) },
    syncLinks: (deviceId) => roomLinks.sync(deviceId),
    newId,
    now,
    log: seams.log,
  });
}

function roomLinksOf(seams: HomeMapSeams, service: HomeMapService, hooks: Applied[]): Wiring {
  const { store, vacuums, log } = seams;
  const vacuum = new XiaomiVacuumSource({
    scene: (deviceId): VacuumScene | undefined => vacuums.scenes.latest(deviceId, 'current'),
    robotMap: (deviceId, robotMapId): VacuumScene | undefined =>
      vacuums.scenes.robotMap(deviceId, robotMapId),
    value: vacuums.control.value,
    log,
  });
  const now = (): string => seams.now().toISOString();
  const roomLinks = new HomeMapRoomLinks({
    maps: service,
    links: {
      list: (deviceId): readonly StoredRoomLink[] => store.vacuumRoomLinks.list(deviceId),
    },
    setRoomFloor: (deviceId, mapRoomId, floor): Promise<void> =>
      vacuums.control.run(deviceId, roomFloor(mapRoomId, materialOf(floor))),
    newId: randomUUID,
    now,
    log,
  });
  hooks.push((result, actor) => {
    background(roomLinks.writeThrough(result, actor), 'home_map.write_through_failed');
  });
  const scans = new ScanStore(nodeScanPorts(seams.scansDirectory, log));
  return { seams, service, vacuum, roomLinks, scans, newId: randomUUID, now };
}

export function assembleHomeMap(seams: HomeMapSeams): HomeMapRuntime {
  const { store, log } = seams;
  const catalogue = new Catalogue(() => createModelCatalog(store.modelCatalog.all()));
  const hooks: Applied[] = [];
  const service = serviceOf(store, catalogue, hooks, log);
  const wiring = roomLinksOf(seams, service, hooks);
  const { vacuum, roomLinks, scans, newId, now } = wiring;
  const registry = new MapSourceRegistry([vacuum]);
  const links = {
    list: (deviceId: string): readonly StoredRoomLink[] => store.vacuumRoomLinks.list(deviceId),
  };
  const ports = { maps: service, links, newId, now, log };
  return {
    service,
    vacuum,
    catalogue,
    roomLinks,
    scans,
    set: mapSetOf(wiring),
    versions: versionsOf(wiring),
    reset: resetOf(wiring),
    feeds: feedsOf(wiring),
    autoCreate: new HomeMapAutoCreate({
      ...ports,
      registry,
      sets: { ids: () => store.homeMaps.ids() },
      currentMap: (deviceId) => vacuum.currentMap(deviceId),
    }),
    imports: new HomeMapSourceImports({
      ...ports,
      registry,
      inventory: () => store.devices.list(),
      syncLinks: (deviceId) => roomLinks.sync(deviceId),
    }),
    devices: deviceSyncOf(seams, service),
    scene: (deviceId) => seams.vacuums.scenes.latest(deviceId, 'current'),
  };
}

export const homeMapOf = (options: BuildOptions): HomeMapRuntime =>
  assembleHomeMap({
    store: options.store,
    vacuums: options.core.hub.vacuums,
    scansDirectory: options.layout.home.homeMapScans,
    now: options.clock.now,
    log: options.log.forArea('hub.home-map'),
  });

function followVacuum(runtime: HomeMapRuntime, change: LiveChange): void {
  if (change.table !== 'device_state' || change.record === null) return;
  const { device_id: deviceId, capability } = change.record;
  if (capability === VACUUM_MAP_KEY) {
    const scene = runtime.scene(deviceId);
    if (scene !== undefined) runtime.vacuum.published(deviceId, scene);
  } else if (capability === STATUS_KEY) {
    runtime.vacuum.statusChanged(deviceId);
  } else if (capability === VACUUM_ROOM_LINKS_KEY) {
    runtime.roomLinks.sync(deviceId);
  } else if (capability === VACUUM_SAVED_MAPS_KEY) {
    runtime.vacuum.savedMapsChanged(deviceId);
  }
}

function followInventory(
  runtime: HomeMapRuntime,
  context: Pick<ServerContext, 'store'>,
  change: LiveChange,
): void {
  if (change.table === 'model_catalog') runtime.catalogue.refresh();
  if (change.table !== 'devices' || change.operation === 'UPDATE') return;
  if (change.operation === 'DELETE' && change.oldRecord !== null) {
    runtime.vacuum.detach(change.oldRecord.id);
  }
  const inventory = context.store.devices.list();
  runtime.autoCreate.watch(inventory);
  runtime.feeds.watch(inventory);
}

export function startHomeMap(context: Pick<ServerContext, 'homeMap' | 'store'>): () => void {
  const { homeMap: runtime, store } = context;
  const inventory = store.devices.list();
  runtime.autoCreate.watch(inventory);
  runtime.feeds.watch(inventory);
  const stopDevices = runtime.devices.start(store.feed);
  const stopFeed = store.feed.subscribe((change) => {
    followVacuum(runtime, change);
    followInventory(runtime, context, change);
  });
  return (): void => {
    stopFeed();
    stopDevices();
    runtime.autoCreate.stop();
    runtime.feeds.stop();
  };
}
