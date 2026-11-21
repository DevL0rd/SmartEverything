import {
  MODEL_DEFAULTS,
  createModelMetadataIndex,
  type ModelOverrideScope,
} from '@smarteverything/domain';
import { ModelCatalogService, type ModelBatch } from '../../models/catalog-service';
import type { Admission } from '../../models/contributions';
import { storeUnit } from '../../store/host/unit';
import type { HostStore } from '../../store/host/host-store';
import type { GlbLodLink, NewModelAsset } from '../../store/repositories/model-assets';
import {
  deviceModels,
  listModels,
  resetOverride,
  setOverride,
  type ModelListing,
  type ModelOverrideInput,
  type ModelStoreSources,
} from './model-views';

const METADATA = createModelMetadataIndex([]);

function catalogOf(store: HostStore): ModelCatalogService {
  return new ModelCatalogService({ assets: store.modelAssets, catalog: store.modelCatalog });
}

function sourcesOf(store: HostStore): ModelStoreSources {
  return {
    devices: store.devices,
    catalog: catalogOf(store),
    overrides: store.modelOverrides,
    assets: store.modelAssets,
    metadata: METADATA,
    defaults: () => MODEL_DEFAULTS,
  };
}

export const MODEL_READ_UNITS = {
  modelList: storeUnit((store, query: ModelListing) =>
    listModels(catalogOf(store).catalog().rows, query, METADATA),
  ),
  modelDeviceModels: storeUnit((store, deviceId: string) =>
    deviceModels(sourcesOf(store), store.devices.byId(deviceId)),
  ),
  modelAssetBytes: storeUnit((store, sha256: string) => store.modelAssets.bytes(sha256)),
} as const;

export const MODEL_WRITE_UNITS = {
  modelOverrideSet: storeUnit(
    (
      store,
      input: {
        readonly deviceId: string;
        readonly input: ModelOverrideInput;
        readonly setBy: string;
      },
    ) =>
      setOverride(sourcesOf(store), store.devices.byId(input.deviceId), input.input, input.setBy),
  ),
  modelOverrideReset: storeUnit(
    (store, input: { readonly deviceId: string; readonly scope: ModelOverrideScope }) =>
      resetOverride(sourcesOf(store), store.devices.byId(input.deviceId), input.scope),
  ),
  modelUserSpec: storeUnit(
    (store, input: { readonly profile: string; readonly bytes: Uint8Array }) =>
      catalogOf(store).storeUserSpec(input.profile, input.bytes),
  ),
  modelGlbSave: storeUnit(
    (store, input: { readonly asset: NewModelAsset; readonly levels: readonly GlbLodLink[] }) =>
      store.modelAssets.saveGlb(input.asset, input.levels),
  ),
  modelCatalogReplaceAdmitted: storeUnit(
    (store, input: { readonly batch: ModelBatch; readonly admissions: readonly Admission[] }) =>
      catalogOf(store).replaceAdmitted(input.batch, input.admissions),
  ),
} as const;
