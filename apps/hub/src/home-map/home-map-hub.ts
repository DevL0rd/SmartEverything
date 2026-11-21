import { randomUUID } from 'node:crypto';
import {
  ApiError,
  VACUUM_MAP_KEY,
  VACUUM_ROOM_LINKS_KEY,
  VACUUM_SAVED_MAPS_KEY,
  createModelCatalog,
  placementFacts,
  type HomeMapActor,
  type HomeMapSourceGeometry,
  type LiveChange,
  type ModelCatalog,
  type ModelCatalogRow,
  type VacuumScene,
} from '@smarteverything/domain';
import { background, type Logger } from '@smarteverything/logging';
import { FLOOR_MATERIAL, roomFloor, type FloorMaterial } from '@smarteverything/xiaomi';
import type { BuildOptions } from '../server/build';
import type { MapCache } from '../vacuum/map-cache';
import type { ServerContext } from '../server/context';
import type { VacuumRouteServices } from '../server/handlers/vacuums';
import type { Store } from '../store/store';
import type { HomeMapApplied } from '../store/repositories/home-maps';
import { vacuumPropertyKey } from '../vacuum/capabilities';
import { HomeMapAutoCreate } from './auto-create';
import { HomeMapDeviceSync } from './device-sync';
import { RobotMapFeeds } from './feeds';
import { HomeMapSet } from './map-set';
import {
  hostDeviceModels,
  hostHomeMapStore,
  hostHomeMapVersions,
  hostModelCatalog,
  hostRoomLinks,
  type HomeMapRoomLinkStore,
} from './map-store';
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
  readonly load: () => Promise<void>;
}

type Applied = (result: HomeMapApplied, actor: HomeMapActor) => void;

const STATUS_KEY = vacuumPropertyKey('status');

export class CatalogueNotLoadedError extends Error {
  override readonly name = 'CatalogueNotLoadedError';

  constructor() {
    super('The model catalogue was read before it was loaded from the store.');
  }
}

export class Catalogue {
  private held: ModelCatalog | null = null;
  private asked = 0;
  private taken = 0;

  constructor(private readonly load: () => Promise<readonly ModelCatalogRow[]>) {}

  async refresh(): Promise<void> {
    this.asked += 1;
    const ask = this.asked;
    const rows = await this.load();
    if (ask <= this.taken) return;
    this.taken = ask;
    this.held = createModelCatalog(rows);
  }

  known(modelId: string): boolean {
    return this.catalog().find(modelId) !== undefined || placementFacts(modelId) !== undefined;
  }

  nameOf(modelId: string): string {
    return this.catalog().find(modelId)?.title ?? modelId;
  }

  private catalog(): ModelCatalog {
    if (this.held === null) throw new CatalogueNotLoadedError();
    return this.held;
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
  seams: HomeMapSeams,
  catalogue: Catalogue,
  hooks: readonly Applied[],
): HomeMapService {
  return new HomeMapService({
    store: hostHomeMapStore(seams.store.host),
    knownModel: (modelId) => catalogue.known(modelId),
    applied: (result, actor): void => {
      for (const hook of hooks) hook(result, actor);
    },
    now: () => seams.now().toISOString(),
    log: seams.log,
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
  return new HomeMapDeviceSync({
    maps: service,
    devices: seams.store.live.home.devices,
    modelsOf: hostDeviceModels(seams.store.host),
    log: seams.log,
  });
}

interface Wiring {
  readonly seams: HomeMapSeams;
  readonly service: HomeMapService;
  readonly vacuum: XiaomiVacuumSource;
  readonly roomLinks: HomeMapRoomLinks;
  readonly links: HomeMapRoomLinkStore;
  readonly scans: ScanStore;
  readonly newId: () => string;
  readonly now: () => string;
}

function mapSetOf({ seams, service, scans }: Wiring): HomeMapSet {
  return new HomeMapSet({
    maps: service,
    removeScan: (mapId): void => {
      background(
        scans.exclusive(() => scans.removeAll(mapId)),
        'home_map.scan_remove_failed',
        { mapId },
      );
    },
    log: seams.log,
  });
}

function versionsOf({ seams, service }: Wiring): HomeMapVersions {
  return new HomeMapVersions({
    versions: hostHomeMapVersions(seams.store.host),
    maps: service,
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

function feedsOf({ seams, service, vacuum, roomLinks, links, newId, now }: Wiring): RobotMapFeeds {
  return new RobotMapFeeds({
    source: vacuum,
    maps: service,
    inventory: () => seams.store.live.home.devices.list(),
    links,
    syncLinks: (held, deviceId) => roomLinks.syncHeld(held, deviceId),
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
  const links = hostRoomLinks(store.host);
  const roomLinks = new HomeMapRoomLinks({
    maps: service,
    links,
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
  return { seams, service, vacuum, roomLinks, links, scans, newId: randomUUID, now };
}

export function assembleHomeMap(seams: HomeMapSeams): HomeMapRuntime {
  const { store, log } = seams;
  const catalogue = new Catalogue(hostModelCatalog(store.host));
  const hooks: Applied[] = [];
  const service = serviceOf(seams, catalogue, hooks);
  const wiring = roomLinksOf(seams, service, hooks);
  const { vacuum, roomLinks, links, scans, newId, now } = wiring;
  const registry = new MapSourceRegistry([vacuum]);
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
      currentMap: (deviceId) => vacuum.currentMap(deviceId),
    }),
    imports: new HomeMapSourceImports({
      ...ports,
      registry,
      inventory: () => store.live.home.devices.list(),
      syncLinks: (held, deviceId) => roomLinks.syncHeld(held, deviceId),
    }),
    devices: deviceSyncOf(seams, service),
    scene: (deviceId) => seams.vacuums.scenes.latest(deviceId, 'current'),
    load: async (): Promise<void> => {
      await Promise.all([store.live.home.load(), service.load(), catalogue.refresh()]);
    },
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
    background(runtime.roomLinks.sync(deviceId), 'home_map.room_link_sync_failed', { deviceId });
  } else if (capability === VACUUM_SAVED_MAPS_KEY) {
    runtime.vacuum.savedMapsChanged(deviceId);
  }
}

function followInventory(
  runtime: HomeMapRuntime,
  context: Pick<ServerContext, 'store'>,
  change: LiveChange,
): void {
  if (change.table === 'model_catalog') {
    background(runtime.catalogue.refresh(), 'home_map.catalogue_refresh_failed');
  }
  if (change.table !== 'devices' || change.operation === 'UPDATE') return;
  if (change.operation === 'DELETE' && change.oldRecord !== null) {
    runtime.vacuum.detach(change.oldRecord.id);
  }
  const inventory = context.store.live.home.devices.list();
  background(runtime.autoCreate.watch(inventory), 'home_map.auto_create_failed');
  background(runtime.feeds.watch(inventory), 'home_map.feed_import_failed');
}

export async function startHomeMap(
  context: Pick<ServerContext, 'homeMap' | 'store'>,
): Promise<() => void> {
  const { homeMap: runtime, store } = context;
  const stopCopy = store.feed.subscribe((change) => {
    runtime.service.follow(change);
  });
  await runtime.load();
  const inventory = store.live.home.devices.list();
  await Promise.all([runtime.autoCreate.watch(inventory), runtime.feeds.watch(inventory)]);
  const stopDevices = runtime.devices.start(store.feed);
  const stopFeed = store.feed.subscribe((change) => {
    followVacuum(runtime, change);
    followInventory(runtime, context, change);
  });
  return (): void => {
    stopFeed();
    stopDevices();
    stopCopy();
    runtime.autoCreate.stop();
    runtime.feeds.stop();
  };
}
