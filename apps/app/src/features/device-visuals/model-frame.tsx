import type {
  DeviceFamily,
  ModelCatalog,
  ModelDevice,
  ModelOverrideIndex,
  ModelSignalValue,
  ModelSpec,
} from '@smarteverything/domain';
import { useCallback, useId, useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { ChannelSignals } from '../../components/models/channels';
import { cn } from '../../design/cn';
import { useDeviceDerived } from '../../store/selectors';
import { FINISH_TOKEN_HASH } from '../../components/models/three/finish-token-hash';
import type { Device, DeviceValues, StoreState } from '../../store/state';
import { useStoreSelector } from '../../store/store-context';
import {
  ASSET_IDLE,
  HeroModelView,
  LiveModelView,
  ModelVisual,
  VIEW_LOD,
  familySubjectOf,
  modelSubjectOf,
  resolvedModelOf,
  useModelCatalog,
  useModelOverrides,
  useModelSpecs,
  type AnchorFrame,
  type LiveModelKey,
  type ModelAssetState,
  type ModelSource,
} from '../models';
import { WidgetModelsContext } from './widget-models-context';
import { signalsOf } from './model/signals-of';
import { AnchorOverlays, type ModelOverlay } from './overlays/screen-overlay';
import type { VisualSize, VisualState, VisualTone } from './types';
import { SIZE_CLASS, type VisualPx } from './visual-size';
import { tallyFrame } from './visual-tally';

export interface ModelPlan {
  readonly specHash: string;
  readonly finish: string | null;
  readonly params: Readonly<Record<string, number>>;
}

type AssetTable = StoreState['tables']['model_assets'];

const NO_PARAMS: Readonly<Record<string, number>> = {};

export function planOf(
  subject: ModelDevice,
  catalog: ModelCatalog,
  overrides: ModelOverrideIndex,
  assets: AssetTable,
): ModelPlan | null {
  const { resolution, specHash } = resolvedModelOf(subject, catalog, overrides);
  if (specHash === null) return null;
  const { main } = resolution;
  const kind = main?.kind === 'asset' ? assets.byId[main.hash]?.kind : undefined;
  if (kind === 'glb') return null;
  return { specHash, finish: resolution.finish ?? null, params: resolution.params ?? NO_PARAMS };
}

export class WidgetModels {
  private readonly devices = new WeakMap<Device, ModelPlan | null>();
  private readonly families = new Map<DeviceFamily, ModelPlan | null>();

  constructor(
    private readonly catalog: ModelCatalog,
    private readonly overrides: ModelOverrideIndex,
    private readonly assets: AssetTable,
  ) {}

  planFor(device: Device | null, family: DeviceFamily): ModelPlan | null {
    if (device === null) {
      if (!this.families.has(family)) this.families.set(family, this.plan(familySubjectOf(family)));
      return this.families.get(family) ?? null;
    }
    if (!this.devices.has(device)) this.devices.set(device, this.plan(modelSubjectOf(device)));
    return this.devices.get(device) ?? null;
  }

  private plan(subject: ModelDevice): ModelPlan | null {
    return planOf(subject, this.catalog, this.overrides, this.assets);
  }
}

function selectAssets(state: StoreState): AssetTable {
  return state.tables.model_assets;
}

export function WidgetModelsProvider({ children }: { readonly children: ReactNode }): ReactNode {
  const catalog = useModelCatalog();
  const overrides = useModelOverrides();
  const assets = useStoreSelector(selectAssets);
  const models = useMemo(
    () => new WidgetModels(catalog, overrides, assets),
    [catalog, overrides, assets],
  );
  return <WidgetModelsContext value={models}>{children}</WidgetModelsContext>;
}

function finishOf(spec: ModelSpec, wanted: string | null): string | null {
  const finishes = spec.finishes ?? {};
  return wanted !== null && Object.hasOwn(finishes, wanted) ? wanted : (spec.defaultFinish ?? null);
}

export function modelSourceOf(
  plan: ModelPlan,
  loaded: ModelAssetState<ModelSpec>,
): ModelSource | null {
  if (loaded.status !== 'ready') return null;
  const spec = loaded.value;
  return {
    spec,
    specHash: plan.specHash,
    tokenHash: FINISH_TOKEN_HASH,
    finish: finishOf(spec, plan.finish),
    params: plan.params,
  };
}

export function liveKeyOf(source: ModelSource, size: VisualSize): LiveModelKey {
  return {
    specHash: source.specHash,
    lod: VIEW_LOD[size],
    finish: source.finish,
    params: source.params,
  };
}

function signalValue(value: unknown): ModelSignalValue | undefined {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  return typeof value === 'string' ? value : undefined;
}

export function capabilitySignals(values: DeviceValues): ChannelSignals {
  return Object.fromEntries(
    Object.entries(values).flatMap(([key, entry]) => {
      const value = signalValue(entry.value);
      return value === undefined ? [] : [[key, value]];
    }),
  );
}

export interface ModelFrameProps {
  readonly family: DeviceFamily;
  readonly device: Device | null;
  readonly state: VisualState;
  readonly size: VisualSize;
  readonly px: VisualPx;
  readonly tone: VisualTone;
  readonly plan: ModelPlan;
  readonly interactive: boolean;
}

interface ShownModel extends ModelFrameProps {
  readonly source: ModelSource;
}

function useModelInputs(props: ShownModel): {
  readonly signals: ChannelSignals;
  readonly model: LiveModelKey;
  readonly still: ReactNode;
} {
  const { family, state, size, px, tone, source } = props;
  const signals = useMemo((): ChannelSignals => signalsOf(family, state), [family, state]);
  const model = useMemo(() => liveKeyOf(source, size), [source, size]);
  const overlay = useMemo((): ModelOverlay => ({ state, size, tone }), [state, size, tone]);
  const paint = useCallback(
    (frame: AnchorFrame): ReactNode => <AnchorOverlays frame={frame} overlay={overlay} />,
    [overlay],
  );
  const still = (
    <ModelVisual source={source} view={size} px={px} signals={signals} overlay={paint} />
  );
  return { signals, model, still };
}

function WidgetModel(props: ShownModel): ReactNode {
  const { size, px, source } = props;
  const id = useId();
  const { signals, model, still } = useModelInputs(props);
  return (
    <LiveModelView
      id={id}
      spec={source.spec}
      model={model}
      view={size}
      px={px}
      signals={signals}
      still={still}
    />
  );
}

function HeroModel(props: ShownModel & { readonly device: Device }): ReactNode {
  const { device, px, source } = props;
  const id = useId();
  const { signals, model, still } = useModelInputs(props);
  const capabilities = useDeviceDerived(device.id, capabilitySignals, []);
  return (
    <HeroModelView
      id={id}
      title={device.label}
      spec={source.spec}
      model={model}
      px={px}
      signals={signals}
      capabilities={capabilities}
      still={still}
    />
  );
}

function ShownModelView(props: ShownModel): ReactNode {
  const { device, interactive } = props;
  return interactive && device !== null ? (
    <HeroModel {...props} device={device} />
  ) : (
    <WidgetModel {...props} />
  );
}

export function ModelFrame(props: ModelFrameProps): ReactNode {
  const { family, device, px, tone, plan, interactive } = props;
  const [frame] = useState(() => tallyFrame(family));
  const loaded = useModelSpecs([plan.specHash])[0] ?? ASSET_IDLE;
  const source = useMemo(() => modelSourceOf(plan, loaded), [plan, loaded]);
  const sized = source === null || !interactive || device === null;
  return (
    <View
      ref={frame}
      aria-hidden={sized}
      pointerEvents={sized ? 'none' : 'box-none'}
      className={cn(
        'relative shrink-0',
        sized && SIZE_CLASS[px],
        tone === 'offline' && 'opacity-60',
      )}
    >
      {source === null ? null : <ShownModelView {...props} source={source} />}
    </View>
  );
}
