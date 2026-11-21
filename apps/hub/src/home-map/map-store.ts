import type {
  DeviceRow,
  HomeMapId,
  HomeMapRevisionEntry,
  HomeMapSummary,
  HomeMapVersion,
  HomeMapVersionId,
  ModelCatalogRow,
} from '@smarteverything/domain';
import type { StoreHost } from '../store/host/host';
import type { HomeMapsRepository, HomeMapRevisionFilter } from '../store/repositories/home-maps';
import type {
  HomeMapVersionSnapshot,
  HomeMapVersionsRepository,
} from '../store/repositories/home-map-versions';
import type { StoredRoomLink } from '../store/repositories/vacuum-room-links';
import type { HomeMapApplied } from '../store/repositories/home-maps';
import {
  applyHomeMaps,
  createHomeMap,
  homeMapSetView,
  removeHomeMap,
  saveHomeMapVersion,
  updateHomeMap,
  type HomeMapApplyInput,
  type HomeMapCreateInput,
  type HomeMapDeviceModel,
  type HomeMapSetView,
  type HomeMapUpdateInput,
  type HomeMapVersionInput,
  type HomeMapWritten,
} from './map-units';

export interface HomeMapStore {
  readonly view: () => Promise<HomeMapSetView>;
  readonly revisions: (filter: HomeMapRevisionFilter) => Promise<HomeMapRevisionEntry[]>;
  readonly apply: (input: HomeMapApplyInput) => Promise<HomeMapWritten<HomeMapApplied[]>>;
  readonly create: (input: HomeMapCreateInput) => Promise<HomeMapWritten<HomeMapSummary>>;
  readonly update: (input: HomeMapUpdateInput) => Promise<HomeMapWritten<HomeMapSummary>>;
  readonly remove: (mapId: HomeMapId) => Promise<HomeMapWritten<boolean>>;
}

export interface HomeMapVersionStore {
  readonly save: (input: HomeMapVersionInput) => Promise<HomeMapVersion>;
  readonly list: (mapId: HomeMapId) => Promise<HomeMapVersion[]>;
  readonly read: (
    mapId: HomeMapId,
    versionId: HomeMapVersionId,
  ) => Promise<HomeMapVersionSnapshot | null>;
}

export interface HomeMapRoomLinkStore {
  readonly list: (deviceId: string) => Promise<readonly StoredRoomLink[]>;
}

export function hostHomeMapStore(host: StoreHost): HomeMapStore {
  return {
    view: () => host.read('homeMapView', null),
    revisions: (filter) => host.read('homeMapRevisions', filter),
    apply: (input) => host.write('applyHomeMaps', input),
    create: (input) => host.write('createHomeMap', input),
    update: (input) => host.write('updateHomeMap', input),
    remove: (mapId) => host.write('removeHomeMap', mapId),
  };
}

export function hostHomeMapVersions(host: StoreHost): HomeMapVersionStore {
  return {
    save: (input) => host.write('saveHomeMapVersion', input),
    list: (mapId) => host.call('homeMapVersions', 'list', mapId),
    read: (mapId, versionId) => host.call('homeMapVersions', 'read', mapId, versionId),
  };
}

export function hostRoomLinks(host: StoreHost): HomeMapRoomLinkStore {
  return { list: (deviceId) => host.call('vacuumRoomLinks', 'list', deviceId) };
}

export function hostModelCatalog(host: StoreHost): () => Promise<ModelCatalogRow[]> {
  return () => host.call('modelCatalog', 'all');
}

export function hostDeviceModels(
  host: StoreHost,
): (devices: readonly DeviceRow[]) => Promise<HomeMapDeviceModel[]> {
  return (devices) => host.read('homeMapDeviceModels', devices);
}

type Write = <T>(work: () => T) => T;

const settled = async <T>(work: () => T): Promise<T> => {
  await Promise.resolve();
  return work();
};

export function directHomeMapStore(homeMaps: HomeMapsRepository, write: Write): HomeMapStore {
  const store = { homeMaps };
  return {
    view: () => settled(() => homeMapSetView(store)),
    revisions: (filter) => settled(() => homeMaps.revisions(filter)),
    apply: (input) => settled(() => write(() => applyHomeMaps(store, input))),
    create: (input) => settled(() => write(() => createHomeMap(store, input))),
    update: (input) => settled(() => write(() => updateHomeMap(store, input))),
    remove: (mapId) => settled(() => write(() => removeHomeMap(store, mapId))),
  };
}

export function directHomeMapVersions(
  homeMaps: HomeMapsRepository,
  homeMapVersions: HomeMapVersionsRepository,
  write: Write,
): HomeMapVersionStore {
  const store = { homeMaps, homeMapVersions };
  return {
    save: (input) => settled(() => write(() => saveHomeMapVersion(store, input))),
    list: (mapId) => settled(() => homeMapVersions.list(mapId)),
    read: (mapId, versionId) => settled(() => homeMapVersions.read(mapId, versionId)),
  };
}
