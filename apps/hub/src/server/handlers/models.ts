import type { IncomingMessage } from 'node:http';
import {
  API_ENDPOINTS as E,
  ApiError,
  createOverrideIndex,
  deviceFamily,
  modelDeviceIdentity,
  modelIdentityKey,
  resolveModel,
  type DeviceModels,
  type DeviceModelView,
  type DeviceRow,
  type EndpointShape,
  type JsonValue,
  type ModelCatalogRow,
  type ModelDefaults,
  type ModelDevice,
  type ModelMetadataIndex,
  type ModelOverrideRow,
  type ModelOverrideScope,
  type ModelResolution,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import type { ModelCatalogService } from '../../models/catalog-service';
import type { ModelAssetsRepository } from '../../store/repositories/model-assets';
import type { ModelOverridesRepository } from '../../store/repositories/model-overrides';
import type { Store } from '../../store/store';
import type { Caller } from '../auth';
import { bound } from '../router';

export interface ModelResolveSources {
  readonly catalog: Pick<ModelCatalogService, 'catalog' | 'reportTie'>;
  readonly overrides: Pick<ModelOverridesRepository, 'all'>;
  readonly defaults: () => ModelDefaults;
}

export interface ModelRouteServices extends ModelResolveSources {
  readonly devices: Pick<Store['devices'], 'byId'>;
  readonly catalog: Pick<ModelCatalogService, 'catalog' | 'reportTie' | 'storeUserSpec'>;
  readonly overrides: Pick<ModelOverridesRepository, 'all' | 'set' | 'reset'>;
  readonly assets: Pick<ModelAssetsRepository, 'find' | 'bytes' | 'save' | 'saveGlb'>;
  readonly metadata: Pick<ModelMetadataIndex, 'find'>;
  readonly profileOf: (caller: Caller) => string;
  readonly authorize: (request: IncomingMessage, endpoint: EndpointShape) => Caller;
}

export interface DeviceModelResolution {
  readonly subject: ModelDevice;
  readonly resolution: ModelResolution;
  readonly overrides: readonly ModelOverrideRow[];
}

type Listing = z.output<typeof E.listModels.query>;

type OverrideInput = z.output<typeof E.setDeviceModelOverride.body>;

const log = new Logger('hub.models');

const SPEC_FINISHES = z.looseObject({
  finishes: z.record(z.string(), z.unknown()).optional(),
  defaultFinish: z.string().optional(),
});

interface Finishes {
  readonly finishes: readonly string[];
  readonly defaultFinish: string | null;
}

const NO_FINISHES: Finishes = { finishes: [], defaultFinish: null };

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

function overrideTarget(scope: ModelOverrideScope, subject: ModelDevice): string {
  switch (scope) {
    case 'device':
      return subject.id;
    case 'identity':
      return modelIdentityKey(modelDeviceIdentity(subject));
    case 'family':
      return subject.family;
  }
}

function haystackOf(row: ModelCatalogRow, metadata: ModelRouteServices['metadata']): string {
  const names = metadata.find(row.id)?.names;
  return [row.id, row.title, row.category, ...row.aliases, ...row.brands]
    .concat(names === undefined ? [] : [names.display, ...names.synonyms])
    .join('\n')
    .toLowerCase();
}

function listModels(
  rows: readonly ModelCatalogRow[],
  query: Listing,
  metadata: ModelRouteServices['metadata'],
): ModelCatalogRow[] {
  const words = (query.q ?? '')
    .toLowerCase()
    .split(/\s+/u)
    .filter((word) => word !== '');
  return rows.filter((row) => {
    if (
      query.category !== undefined &&
      row.category.toLowerCase() !== query.category.toLowerCase()
    ) {
      return false;
    }
    if (query.family !== undefined && !row.match.families.includes(query.family)) return false;
    const haystack = words.length === 0 ? '' : haystackOf(row, metadata);
    return words.every((word) => haystack.includes(word));
  });
}

function finishesOf(assets: ModelRouteServices['assets'], hash: string | null): Finishes {
  if (hash === null) return NO_FINISHES;
  const stored = assets.bytes(hash);
  if (stored?.kind !== 'spec') return NO_FINISHES;
  const spec = SPEC_FINISHES.parse(JSON.parse(new TextDecoder().decode(stored.bytes)));
  return {
    finishes: Object.keys(spec.finishes ?? {}),
    defaultFinish: spec.defaultFinish ?? null,
  };
}

function specHashOf(services: ModelRouteServices, resolution: ModelResolution): string | null {
  const { main } = resolution;
  if (main === null) return null;
  return main.kind === 'asset'
    ? main.hash
    : (services.catalog.catalog().find(main.modelId)?.spec_sha256 ?? null);
}

function applying(
  overrides: readonly ModelOverrideRow[],
  subject: ModelDevice,
): ModelOverrideRow[] {
  const keys = new Set(
    (['device', 'identity', 'family'] as const).map(
      (scope) => `${scope}\n${overrideTarget(scope, subject)}`,
    ),
  );
  return overrides.filter((row) => keys.has(`${row.scope}\n${row.target}`));
}

function deviceModels(services: ModelRouteServices, device: DeviceRow): DeviceModels {
  const { subject, resolution, overrides } = resolveDeviceModel(services, device);
  const catalog = services.catalog.catalog();
  const finishes = finishesOf(services.assets, specHashOf(services, resolution));
  return {
    device_id: device.id,
    model: modelViewOf(resolution),
    params: { ...resolution.params },
    identity: {
      brand: subject.brand,
      model_string: subject.model,
      hardware_model: subject.hardwareModel ?? subject.product ?? null,
    },
    candidates: resolution.candidates.flatMap((id) => {
      const row = catalog.find(id);
      return row === undefined ? [] : [{ id: row.id, title: row.title, category: row.category }];
    }),
    finishes: [...finishes.finishes],
    default_finish: finishes.defaultFinish,
    overrides: applying(overrides, subject),
    issues: [...resolution.issues],
  };
}

function checkedSource(services: ModelRouteServices, input: OverrideInput): string | null {
  if (input.model_id !== undefined) {
    const row = services.catalog.catalog().find(input.model_id);
    if (row === undefined) {
      throw new ApiError('not_found', `There is no model ${input.model_id} in the catalogue.`);
    }
    return row.spec_sha256;
  }
  const asset = input.asset_hash === undefined ? undefined : services.assets.find(input.asset_hash);
  if (asset === undefined) {
    throw new ApiError('not_found', 'There is no uploaded model file with this hash.');
  }
  return asset.kind === 'spec' ? asset.sha256 : null;
}

function checkedFinish(services: ModelRouteServices, input: OverrideInput): void {
  const specHash = checkedSource(services, input);
  if (input.finish === undefined) return;
  if (!finishesOf(services.assets, specHash).finishes.includes(input.finish)) {
    throw new ApiError('invalid_request', `This model has no finish named ${input.finish}.`);
  }
}

function setOverride(
  services: ModelRouteServices,
  device: DeviceRow,
  input: OverrideInput,
  caller: Caller,
): ModelOverrideRow {
  checkedFinish(services, input);
  const target = overrideTarget(input.scope, modelDeviceOf(device));
  const row = services.overrides.set({
    scope: input.scope,
    target,
    modelId: input.model_id,
    assetHash: input.asset_hash,
    finish: input.finish,
    params: input.params,
    setBy: services.profileOf(caller),
  });
  log.info('model_override.set', {
    deviceId: device.id,
    scope: row.scope,
    modelId: row.model_id,
    assetHash: row.asset_hash,
    finish: row.finish,
    setBy: row.set_by,
  });
  return row;
}

function resetOverride(
  services: ModelRouteServices,
  device: DeviceRow,
  scope: ModelOverrideScope,
): z.output<typeof E.resetDeviceModelOverride.response> {
  const target = overrideTarget(scope, modelDeviceOf(device));
  const removed = services.overrides.reset(scope, target) !== undefined;
  log.info('model_override.reset', { deviceId: device.id, scope, removed });
  return { scope, target, removed };
}

export const modelRoutes = (services: ModelRouteServices) =>
  ({
    listModels: bound(E.listModels, ({ query }) => ({
      models: listModels(services.catalog.catalog().rows, query, services.metadata),
    })),
    readDeviceModels: bound(E.readDeviceModels, ({ params }) =>
      deviceModels(services, services.devices.byId(params.deviceId)),
    ),
    setDeviceModelOverride: bound(E.setDeviceModelOverride, ({ params, body, caller }) =>
      setOverride(services, services.devices.byId(params.deviceId), body, caller),
    ),
    resetDeviceModelOverride: bound(E.resetDeviceModelOverride, ({ params, query }) =>
      resetOverride(services, services.devices.byId(params.deviceId), query.scope),
    ),
  }) as const;
