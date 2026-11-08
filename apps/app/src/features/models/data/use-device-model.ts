import {
  MODEL_DEFAULTS,
  deviceFamily,
  resolveModel,
  type DeviceFamily,
  type DeviceRow,
  type JsonValue,
  type ModelCatalog,
  type ModelDevice,
  type ModelExtraRole,
  type ModelOverrideIndex,
  type ModelRef,
  type ModelResolution,
  type ModelSource,
  type ModelSpec,
  type ModelTie,
  type TableRow,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { useMemo } from 'react';
import { useStoreSelector } from '../../../store/store-context';
import type { StoreState } from '../../../store/state';
import { ASSET_IDLE, type ModelAssetState } from './asset-loader';
import { useModelCatalog, useModelOverrides } from './catalog';
import { useModelSpecs } from './use-model-asset';

const log = new Logger('app.models');

const NO_PARAMS: Readonly<Record<string, number>> = {};

export interface ResolvedExtra {
  readonly role: ModelExtraRole;
  readonly modelId: string;
  readonly specHash: string | null;
}

export interface ResolvedModel {
  readonly resolution: ModelResolution;
  readonly specHash: string | null;
  readonly extras: readonly ResolvedExtra[];
}

export interface DeviceModelExtra {
  readonly role: ModelExtraRole;
  readonly modelId: string;
  readonly spec: ModelAssetState<ModelSpec>;
}

export type ModelAssetKind = TableRow<'model_assets'>['kind'];

export interface DeviceModel {
  readonly source: ModelSource;
  readonly main: ModelRef | null;
  readonly assetKind: ModelAssetKind | null;
  readonly spec: ModelAssetState<ModelSpec>;
  readonly extras: readonly DeviceModelExtra[];
  readonly finish: string | null;
  readonly params: Readonly<Record<string, number>>;
  readonly candidates: readonly string[];
  readonly issues: readonly string[];
}

function textOf(value: JsonValue | undefined): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

export function modelSubjectOf(device: DeviceRow): ModelDevice {
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

export function familySubjectOf(family: DeviceFamily): ModelDevice {
  return { id: '', brand: '', model: '', family };
}

function specHashOf(ref: ModelRef | null, catalog: ModelCatalog): string | null {
  if (ref === null) return null;
  return ref.kind === 'asset' ? ref.hash : (catalog.find(ref.modelId)?.spec_sha256 ?? null);
}

const reportedTies = new Set<string>();

function reportTie(tie: ModelTie): void {
  const key = `${tie.tier}\n${tie.winner}\n${tie.rival}`;
  if (reportedTies.has(key)) return;
  reportedTies.add(key);
  log.warn('model.tie', { ...tie });
}

export function resolvedModelOf(
  subject: ModelDevice,
  catalog: ModelCatalog,
  overrides: ModelOverrideIndex,
): ResolvedModel {
  const resolution = resolveModel(
    subject,
    { catalog, overrides, defaults: MODEL_DEFAULTS },
    { onTie: reportTie },
  );
  return {
    resolution,
    specHash: specHashOf(resolution.main, catalog),
    extras: resolution.extras.map((extra) => ({
      role: extra.role,
      modelId: extra.modelId,
      specHash: catalog.find(extra.modelId)?.spec_sha256 ?? null,
    })),
  };
}

function missingSpec(modelId: string): ModelAssetState<ModelSpec> {
  return { status: 'failed', detail: `The catalogue lists no model file for ${modelId}.` };
}

function stateOf(
  hash: string | null,
  modelId: string | null,
  loaded: ModelAssetState<ModelSpec> | undefined,
): ModelAssetState<ModelSpec> {
  if (modelId === null) return ASSET_IDLE;
  if (hash === null) return missingSpec(modelId);
  return loaded ?? ASSET_IDLE;
}

function assetHashOf(main: ModelRef | null): string | null {
  return main?.kind === 'asset' ? main.hash : null;
}

function assetKindSelector(hash: string | null): (state: StoreState) => ModelAssetKind | null {
  return (state) => (hash === null ? null : (state.tables.model_assets.byId[hash]?.kind ?? null));
}

function mainIdOf(main: ModelRef | null): string | null {
  if (main === null) return null;
  return main.kind === 'asset' ? main.hash : main.modelId;
}

function useModelOf(subject: ModelDevice): DeviceModel {
  const catalog = useModelCatalog();
  const overrides = useModelOverrides();
  const resolved = useMemo(
    () => resolvedModelOf(subject, catalog, overrides),
    [subject, catalog, overrides],
  );
  const { resolution, extras } = resolved;
  const assetHash = assetHashOf(resolution.main);
  const assetKind = useStoreSelector(assetKindSelector(assetHash), Object.is, [assetHash]);
  const specHash = assetKind === 'glb' ? null : resolved.specHash;
  const loaded = useModelSpecs([specHash, ...extras.map((extra) => extra.specHash)]);
  const mainId = assetKind === 'glb' ? null : mainIdOf(resolution.main);
  return {
    source: resolution.source,
    main: resolution.main,
    assetKind,
    spec: stateOf(specHash, mainId, loaded[0]),
    extras: extras.map((extra, at) => ({
      role: extra.role,
      modelId: extra.modelId,
      spec: stateOf(extra.specHash, extra.modelId, loaded[at + 1]),
    })),
    finish: resolution.finish ?? null,
    params: resolution.params ?? NO_PARAMS,
    candidates: resolution.candidates,
    issues: resolution.issues,
  };
}

export function useDeviceModel(device: DeviceRow): DeviceModel {
  const subject = useMemo(() => modelSubjectOf(device), [device]);
  return useModelOf(subject);
}

export function useFamilyModel(family: DeviceFamily): DeviceModel {
  const subject = useMemo(() => familySubjectOf(family), [family]);
  return useModelOf(subject);
}
