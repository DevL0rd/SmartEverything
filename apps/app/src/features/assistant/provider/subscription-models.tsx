import type { ReactNode } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ENGINE, type Engine, type ComputerAiRuntime } from '@smarteverything/domain';
import { ModelSourceStatus } from '../picker/model-source-status';
import { useIsOwner } from '../../../store/selectors';
import { useFavouriteModels } from '../data/favourites';
import type { ModelChoice, ModelPick } from '../picker/model-choice';
import type { CandidateSource, ModelCandidate } from '../picker/model-candidates';
import { ModelRow } from '../picker/model-row';
import { isComputerEngine, nativeModelKey, COMPUTER_ENGINE_LABELS } from './computer-engine';
import type { EngineCatalogue, EngineComputer } from './engine-catalogue';
import {
  useComputerProviderSupported,
  useEngineCatalogue,
  ENGINE_CATALOGUE_KEY,
} from './provider-data';

export interface NativeModelRequest {
  readonly runtime: ComputerAiRuntime;
  readonly model: string;
}
export interface NativeSupply {
  readonly computer: EngineComputer;
  readonly model: EngineComputer['models'][number];
}
export function nativeSupplies(
  catalogue: EngineCatalogue | undefined,
  request: NativeModelRequest,
): readonly NativeSupply[] {
  return (
    catalogue?.computers
      .filter((row) => row.runtime === request.runtime)
      .flatMap((computer) =>
        computer.models
          .filter((model) => model.id === request.model)
          .map((model) => ({ computer, model })),
      ) ?? []
  );
}
export function nativeSupplyReady(supply: NativeSupply): boolean {
  return (
    supply.model.available &&
    supply.computer.online &&
    supply.computer.enabled &&
    supply.computer.reason === null
  );
}
export function nativeSupplyEngine(supply: NativeSupply, previous: Engine | undefined): Engine {
  const effort = previous?.effort ?? null;
  const settings =
    previous !== undefined &&
    isComputerEngine(previous) &&
    previous.kind === supply.computer.runtime &&
    previous.device_id === supply.computer.device_id
      ? previous.settings
      : supply.computer.provider_options;
  return ENGINE.parse({
    kind: supply.computer.runtime,
    device_id: supply.computer.device_id,
    model: supply.model.id,
    effort: effort !== null && supply.model.efforts.includes(effort) ? effort : null,
    settings,
  });
}
function nativeChoice(supply: NativeSupply): ModelChoice {
  return {
    id: supply.model.id,
    name: supply.model.name,
    provider: COMPUTER_ENGINE_LABELS[supply.computer.runtime].provider,
    providerLabel: supply.computer.runtime === 'claude' ? 'Anthropic' : 'OpenAI',
    supplierLabel: `${COMPUTER_ENGINE_LABELS[supply.computer.runtime].name} native`,
    billing: 'Subscription',
    contextLength: 'context_window' in supply.model ? (supply.model.context_window ?? null) : null,
    price: { inputPerMillion: null, outputPerMillion: null, variable: false },
    efforts: supply.model.efforts,
    latest: false,
    inputs:
      'input_modalities' in supply.model
        ? supply.model.input_modalities
        : ['text', 'image', 'file'],
    outputs: ['text'],
  };
}
interface Props {
  readonly picked: ModelPick | null;
  readonly valid?: () => boolean;
  readonly onPick: ((pick: ModelPick) => void) | null;
  readonly onNativeNeeded?: ((request: NativeModelRequest) => void) | undefined;
}
function selectedDevice(
  picked: ModelPick | null,
  request: NativeModelRequest,
  catalogue: EngineCatalogue,
): string | null {
  const engine = picked?.engine;
  if (
    engine !== undefined &&
    isComputerEngine(engine) &&
    engine.kind === request.runtime &&
    engine.model === request.model
  )
    return engine.device_id;
  return (
    catalogue.preferences.find(
      (row) => row.runtime === request.runtime && row.model === request.model,
    )?.device_id ?? null
  );
}
interface CandidateContext {
  readonly catalogue: EngineCatalogue;
  readonly props: Props;
  readonly favorites: ReturnType<typeof useFavouriteModels>;
  readonly owner: boolean;
  readonly client: QueryClient;
}
function nativeCandidate(supply: NativeSupply, context: CandidateContext): ModelCandidate {
  const { catalogue, props, favorites } = context;
  const request = { runtime: supply.computer.runtime, model: supply.model.id };
  const key = nativeModelKey(request.runtime, request.model);
  const supplies = nativeSupplies(catalogue, request);
  const chosen = supplies.find(
    (row) => row.computer.device_id === selectedDevice(props.picked, request, catalogue),
  );
  const selected =
    props.picked?.engine?.kind === request.runtime && props.picked.model === request.model;
  const saved = favorites.status === 'ready' ? favorites.favourites : new Set<string>();
  const favourite = saved.has(key) || (request.runtime === 'claude' && saved.has(request.model));
  const pick = (): void => {
    pickNative(chosen, request, context);
  };
  const enabled = canPickNative(chosen, context);
  const model = nativeChoice(chosen ?? supply);
  return {
    key,
    pick: enabled ? pick : null,
    model,
    selected,
    favourite,
    render: (): ReactNode => (
      <ModelRow
        model={model}
        selected={selected}
        favourite={favourite}
        onPick={enabled ? pick : null}
        onFavourite={
          favorites.status === 'ready'
            ? (): void => {
                if (props.valid?.() !== false) favorites.toggle(key);
              }
            : null
        }
      />
    ),
  };
}
export function useSubscriptionPicker(props: Props, enabled: boolean): CandidateSource {
  const client = useQueryClient();
  const supported = useComputerProviderSupported();
  const catalogue = useEngineCatalogue();
  const favorites = useFavouriteModels();
  const owner = useIsOwner();
  if (!enabled || !supported) return { candidates: [], status: null };
  if (catalogue.data === undefined)
    return {
      candidates: [],
      status: (
        <ModelSourceStatus
          name="native"
          pending={catalogue.isPending}
          error={catalogue.error}
          retry={(): void => {
            void catalogue.refetch();
          }}
        />
      ),
    };
  const data = catalogue.data;
  const candidates = data.computers.flatMap((computer) =>
    computer.models.map((model) =>
      nativeCandidate({ computer, model }, { catalogue: data, props, favorites, owner, client }),
    ),
  );
  return { candidates, status: null };
}

function canPickNative(chosen: NativeSupply | undefined, context: CandidateContext): boolean {
  if (!context.owner || context.props.onPick === null) return false;
  if (context.props.onNativeNeeded !== undefined) return true;
  return chosen !== undefined && nativeSupplyReady(chosen);
}
function pickNative(
  chosen: NativeSupply | undefined,
  request: NativeModelRequest,
  context: CandidateContext,
): void {
  const { owner, props } = context;
  if (!owner || props.onPick === null || props.valid?.() === false) return;
  if (!nativeCatalogueFresh(context.client)) return;
  const current = currentSupply(context.client, chosen, request);
  if (current === undefined || !nativeSupplyReady(current)) {
    props.onNativeNeeded?.(request);
    return;
  }
  const engine = nativeSupplyEngine(current, props.picked?.engine);
  props.onPick({ model: request.model, effort: engine.effort, engine });
}

function currentSupply(
  client: QueryClient,
  chosen: NativeSupply | undefined,
  request: NativeModelRequest,
): NativeSupply | undefined {
  const catalogue = client.getQueryData<EngineCatalogue>(ENGINE_CATALOGUE_KEY);
  if (catalogue === undefined || chosen === undefined) return undefined;
  return nativeSupplies(catalogue, request).find(
    (row) => row.computer.device_id === chosen.computer.device_id,
  );
}

function nativeCatalogueFresh(client: QueryClient): boolean {
  return client.getQueryState(ENGINE_CATALOGUE_KEY)?.isInvalidated !== true;
}
