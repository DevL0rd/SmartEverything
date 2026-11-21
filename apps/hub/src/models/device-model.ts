import {
  createOverrideIndex,
  deviceFamily,
  MODEL_DEFAULTS,
  resolveModel,
  type DeviceModelView,
  type DeviceRow,
  type JsonValue,
  type ModelDefaults,
  type ModelDevice,
  type ModelOverrideRow,
  type ModelResolution,
} from '@smarteverything/domain';
import type { ModelOverridesRepository } from '../store/repositories/model-overrides';
import type { HostStore } from '../store/host/host-store';
import { ModelCatalogService } from './catalog-service';

export interface ModelResolveSources {
  readonly catalog: Pick<ModelCatalogService, 'catalog' | 'reportTie'>;
  readonly overrides: Pick<ModelOverridesRepository, 'all'>;
  readonly defaults: () => ModelDefaults;
}

export interface DeviceModelResolution {
  readonly subject: ModelDevice;
  readonly resolution: ModelResolution;
  readonly overrides: readonly ModelOverrideRow[];
}

function textOf(value: JsonValue | undefined): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

export function modelDeviceOf(device: DeviceRow): ModelDevice {
  return {
    id: device.id,
    brand: device.manufacturer,
    manufacturer: device.manufacturer,
    model: device.model,
    family: deviceFamily(device),
    hardwareModel: textOf(device.details['hardwareModel']),
    product: textOf(device.details['product']),
  };
}

export function resolveDeviceModel(
  services: ModelResolveSources,
  device: DeviceRow,
): DeviceModelResolution {
  const subject = modelDeviceOf(device);
  const overrides = services.overrides.all();
  const resolution = resolveModel(
    subject,
    {
      catalog: services.catalog.catalog(),
      overrides: createOverrideIndex(overrides),
      defaults: services.defaults(),
    },
    { onTie: services.catalog.reportTie },
  );
  return { subject, resolution, overrides };
}

export function modelViewOf(resolution: ModelResolution): DeviceModelView {
  const { main } = resolution;
  return {
    id: main?.kind === 'catalogue' ? main.modelId : null,
    asset_hash: main?.kind === 'asset' ? main.hash : null,
    source: resolution.source,
    finish: resolution.finish ?? null,
    extras: [...resolution.extras],
  };
}

export function modelResolveSources(
  store: Pick<HostStore, 'modelAssets' | 'modelCatalog' | 'modelOverrides'>,
): ModelResolveSources {
  return {
    catalog: new ModelCatalogService({ assets: store.modelAssets, catalog: store.modelCatalog }),
    overrides: store.modelOverrides,
    defaults: () => MODEL_DEFAULTS,
  };
}
