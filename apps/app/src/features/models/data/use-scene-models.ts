import type {
  DeviceRow,
  ModelCatalog,
  ModelOverrideIndex,
  ModelSpec,
} from '@smarteverything/domain';
import { useMemo } from 'react';
import type { SceneModelsWire } from '../../../components/house-map/3d/render-core-objects';
import type { RenderObject, RenderPlacement } from '../../../components/house-map/render-scene';
import { sameJson } from '../../../store/same-json';
import { rowsOf, type StoreState } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';
import type { ModelAssetState } from './asset-loader';
import { modelCatalogOf, modelOverrideIndexOf } from './catalog';
import { modelSubjectOf, resolvedModelOf, type ModelAssetKind } from './use-device-model';
import { useModelSpecs } from './use-model-asset';

export interface SceneModelFloor {
  readonly objects: readonly Pick<RenderObject, 'modelId'>[];
  readonly placements: readonly Pick<RenderPlacement, 'deviceId'>[];
}

export interface SceneModelSources {
  readonly deviceOf: (deviceId: string) => DeviceRow | undefined;
  readonly assetKindOf: (sha256: string) => ModelAssetKind | null;
  readonly catalog: ModelCatalog;
  readonly overrides: ModelOverrideIndex;
}

export interface SceneDeviceWant {
  readonly deviceId: string;
  readonly hash: string;
}

export interface SceneModelWants {
  readonly objects: readonly string[];
  readonly devices: readonly SceneDeviceWant[];
}

const UNBUILT_ASSETS: ReadonlySet<ModelAssetKind> = new Set(['glb']);

function deviceHashOf(device: DeviceRow, sources: SceneModelSources): string | null {
  const { resolution, specHash } = resolvedModelOf(
    modelSubjectOf(device),
    sources.catalog,
    sources.overrides,
  );
  if (specHash === null) return null;
  const kind = resolution.main?.kind === 'asset' ? sources.assetKindOf(specHash) : null;
  return kind !== null && UNBUILT_ASSETS.has(kind) ? null : specHash;
}

export function sceneModelWantsOf(
  floor: SceneModelFloor,
  sources: SceneModelSources,
): SceneModelWants {
  const objects = new Set<string>();
  for (const object of floor.objects) {
    if (object.modelId === null) continue;
    const hash = sources.catalog.find(object.modelId)?.spec_sha256 ?? null;
    if (hash !== null) objects.add(hash);
  }
  const devices: SceneDeviceWant[] = [];
  for (const placement of floor.placements) {
    const device = sources.deviceOf(placement.deviceId);
    const hash = device === undefined ? null : deviceHashOf(device, sources);
    if (hash !== null) devices.push({ deviceId: placement.deviceId, hash });
  }
  return { objects: [...objects], devices };
}

export function sceneModelsOf(
  wants: SceneModelWants,
  specOf: (sha256: string) => ModelSpec | undefined,
): SceneModelsWire {
  const specs = new Map<string, ModelSpec>();
  for (const hash of wants.objects) {
    const spec = specOf(hash);
    if (spec !== undefined) specs.set(spec.id, spec);
  }
  const devices: Record<string, string> = {};
  for (const want of wants.devices) {
    const spec = specOf(want.hash);
    if (spec === undefined) continue;
    specs.set(spec.id, spec);
    devices[want.deviceId] = spec.id;
  }
  return { specs: [...specs.values()], devices };
}

function sourcesOf(state: StoreState): SceneModelSources {
  const { devices, model_assets: assets, model_catalog, model_overrides } = state.tables;
  return {
    deviceOf: (deviceId) => devices.byId[deviceId],
    assetKindOf: (sha256) => assets.byId[sha256]?.kind ?? null,
    catalog: modelCatalogOf(rowsOf(model_catalog)),
    overrides: modelOverrideIndexOf(rowsOf(model_overrides)),
  };
}

function hashesOf(wants: SceneModelWants): readonly string[] {
  return [...new Set([...wants.objects, ...wants.devices.map((want) => want.hash)])];
}

function readySpecs(
  hashes: readonly string[],
  loaded: readonly ModelAssetState<ModelSpec>[],
): ReadonlyMap<string, ModelSpec> {
  const ready = new Map<string, ModelSpec>();
  hashes.forEach((hash, at) => {
    const state = loaded[at];
    if (state?.status === 'ready') ready.set(hash, state.value);
  });
  return ready;
}

export function useSceneModels(floor: SceneModelFloor): SceneModelsWire {
  const wants = useStoreSelector((state) => sceneModelWantsOf(floor, sourcesOf(state)), sameJson, [
    floor,
  ]);
  const hashes = useMemo(() => hashesOf(wants), [wants]);
  const loaded = useModelSpecs(hashes);
  return useMemo(() => {
    const ready = readySpecs(hashes, loaded);
    return sceneModelsOf(wants, (hash) => ready.get(hash));
  }, [wants, hashes, loaded]);
}
