import {
  ApiError,
  type DeviceRow,
  type HomeMap,
  type HomeMapActor,
  type HomeMapId,
  type HomeMapOp,
  type HomeMapSummary,
  type HomeMapVersion,
} from '@smarteverything/domain';
import { modelResolveSources, resolveDeviceModel } from '../models/device-model';
import { storeUnit } from '../store/host/unit';
import type {
  HomeMapApplied,
  HomeMapHistoryMark,
  HomeMapPatch,
  HomeMapRevisionFilter,
} from '../store/repositories/home-maps';
import type { HostStore } from '../store/host/host-store';

export interface HomeMapEntry {
  readonly id: HomeMapId;
  readonly position: number;
  readonly isDefault: boolean;
}

export interface HomeMapSetView {
  readonly entries: readonly HomeMapEntry[];
  readonly maps: readonly HomeMap[];
}

export interface HomeMapWritten<T> {
  readonly value: T;
  readonly view: HomeMapSetView;
}

export interface HomeMapBatch {
  readonly mapId: HomeMapId | null;
  readonly ops: readonly HomeMapOp[];
}

export interface HomeMapApplyInput {
  readonly batches: readonly HomeMapBatch[];
  readonly actor: HomeMapActor;
  readonly mark: HomeMapHistoryMark;
  readonly refuseSourceConflictOn: HomeMapId | null;
}

export interface HomeMapCreateInput {
  readonly name: string;
  readonly actor: HomeMapActor;
}

export interface HomeMapUpdateInput {
  readonly mapId: HomeMapId;
  readonly patch: HomeMapPatch;
  readonly actor: HomeMapActor;
}

export interface HomeMapVersionInput {
  readonly mapId: HomeMapId;
  readonly name: string | null;
  readonly actor: HomeMapActor;
}

export interface HomeMapDeviceModel {
  readonly deviceId: string;
  readonly modelId: string | null;
}

export type HomeMapRepositories = Pick<HostStore, 'homeMaps'>;

function viewOf(store: HomeMapRepositories, touched: readonly HomeMapId[]): HomeMapSetView {
  const entries = store.homeMaps.entries();
  const present = new Set(entries.map((entry) => entry.id));
  const maps = [...new Set(touched)].flatMap((id) =>
    present.has(id) ? (store.homeMaps.stored(id) ?? []) : [],
  );
  return { entries, maps };
}

export function homeMapSetView(store: HomeMapRepositories): HomeMapSetView {
  return viewOf(
    store,
    store.homeMaps.entries().map((entry) => entry.id),
  );
}

export function applyHomeMaps(
  store: HomeMapRepositories,
  input: HomeMapApplyInput,
): HomeMapWritten<HomeMapApplied[]> {
  const results = input.batches.map((batch) =>
    store.homeMaps.apply(batch.ops, input.actor, input.mark, batch.mapId ?? undefined),
  );
  const refused = input.refuseSourceConflictOn;
  if (
    refused !== null &&
    results.some(
      (result) =>
        result.map.id === refused && result.conflicts.some((entry) => entry.kind === 'source'),
    )
  ) {
    throw new ApiError('conflict', 'The robot map cannot feed that floor.');
  }
  return {
    value: results,
    view: viewOf(
      store,
      results.map((result) => result.map.id),
    ),
  };
}

export function createHomeMap(
  store: HomeMapRepositories,
  input: HomeMapCreateInput,
): HomeMapWritten<HomeMapSummary> {
  const created = store.homeMaps.create(input.name, input.actor);
  return { value: created, view: viewOf(store, [created.id]) };
}

export function updateHomeMap(
  store: HomeMapRepositories,
  input: HomeMapUpdateInput,
): HomeMapWritten<HomeMapSummary> {
  const updated = store.homeMaps.update(input.mapId, input.patch, input.actor);
  return { value: updated, view: viewOf(store, [input.mapId]) };
}

export function removeHomeMap(
  store: HomeMapRepositories,
  mapId: HomeMapId,
): HomeMapWritten<boolean> {
  return { value: store.homeMaps.remove(mapId), view: viewOf(store, []) };
}

export function saveHomeMapVersion(
  store: Pick<HostStore, 'homeMaps' | 'homeMapVersions'>,
  input: HomeMapVersionInput,
): HomeMapVersion {
  const map = store.homeMaps.read(input.mapId);
  return store.homeMapVersions.save(input.mapId, map, input.name, input.actor);
}

export const HOME_MAP_VIEW_UNIT = storeUnit((store, _input: null) => homeMapSetView(store));

export const HOME_MAP_REVISIONS_UNIT = storeUnit((store, filter: HomeMapRevisionFilter) =>
  store.homeMaps.revisions(filter),
);

export const HOME_MAP_DEVICE_MODELS_UNIT = storeUnit(
  (store, devices: readonly DeviceRow[]): HomeMapDeviceModel[] => {
    const sources = modelResolveSources(store);
    return devices.map((device) => {
      const { main } = resolveDeviceModel(sources, device).resolution;
      return { deviceId: device.id, modelId: main?.kind === 'catalogue' ? main.modelId : null };
    });
  },
);

export const APPLY_HOME_MAPS_UNIT = storeUnit(applyHomeMaps);

export const CREATE_HOME_MAP_UNIT = storeUnit(createHomeMap);

export const UPDATE_HOME_MAP_UNIT = storeUnit(updateHomeMap);

export const REMOVE_HOME_MAP_UNIT = storeUnit(removeHomeMap);

export const SAVE_HOME_MAP_VERSION_UNIT = storeUnit(saveHomeMapVersion);
