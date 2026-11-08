import type { ReactNode } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  nativeModelOptionReason,
  type Engine,
  type ComputerAiRuntime,
} from '@smarteverything/domain';
import { useIsOwner } from '../../../store/selectors';
import { useFavouriteModels } from '../data/favourites';
import type { ModelChoice, ModelPick } from '../picker/model-choice';
import type { CandidateSource, ModelCandidate } from '../data/model-candidates';
import { ModelRow } from '../picker/model-row';
import {
  isComputerEngine,
  nativeModelKey,
  COMPUTER_ENGINE_LABELS,
  type ComputerEngine,
} from './computer-engine';
import type { EngineCatalogue, EngineComputer } from './engine-catalogue';
import { useEngineCatalogue, ENGINE_CATALOGUE_KEY } from './provider-data';
import { background } from '@smarteverything/logging';

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
export function nativeSupplyEngine(
  supply: NativeSupply,
  previous: Engine | undefined,
): ComputerEngine {
  const { computer, model } = supply;
  const fields = {
    device_id: computer.device_id,
    model: model.id,
    effort: carriedEffort(model, previous),
  };
  const current = isSameComputer(previous, computer) ? previous : undefined;
  if (computer.runtime === 'claude') {
    const settings = {
      ...computer.provider_options,
      ...(current?.kind === 'claude' ? current.settings : undefined),
    };
    return { ...fields, kind: 'claude', settings };
  }
  const settings = {
    ...computer.provider_options,
    ...(current?.kind === 'codex' ? current.settings : undefined),
  };
  return { ...fields, kind: 'codex', settings };
}

function carriedEffort(
  model: NativeSupply['model'],
  previous: Engine | undefined,
): Engine['effort'] {
  const effort = previous?.effort ?? null;
  return effort !== null && model.efforts.includes(effort) ? effort : null;
}

function isSameComputer(
  engine: Engine | undefined,
  computer: EngineComputer,
): engine is ComputerEngine {
  return (
    engine !== undefined &&
    isComputerEngine(engine) &&
    engine.kind === computer.runtime &&
    engine.device_id === computer.device_id
  );
}

export function nativeSupplyOptionReason(
  supply: NativeSupply,
  previous: Engine | undefined,
): string | null {
  return nativeModelOptionReason(nativeSupplyEngine(supply, previous), supply.model);
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
  readonly scope?: ComputerEngine;
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
function chosenSupply(
  supplies: readonly NativeSupply[],
  request: NativeModelRequest,
  { props, catalogue }: CandidateContext,
): NativeSupply | undefined {
  const deviceId = props.scope?.device_id ?? selectedDevice(props.picked, request, catalogue);
  return supplies.find((row) => row.computer.device_id === deviceId);
}

function nativeCandidate(supply: NativeSupply, context: CandidateContext): ModelCandidate {
  const { catalogue, props, favorites } = context;
  const request = { runtime: supply.computer.runtime, model: supply.model.id };
  const key = nativeModelKey(request.runtime, request.model);
  const supplies = nativeSupplies(catalogue, request);
  const chosen = chosenSupply(supplies, request, context);
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
  const catalogue = useEngineCatalogue();
  const favorites = useFavouriteModels();
  const owner = useIsOwner();
  if (!enabled) return { candidates: [], status: null };
  if (catalogue.data === undefined)
    return {
      candidates: [],
      status: {
        name: 'native',
        pending: catalogue.isPending,
        error: catalogue.error,
        retry: (): void => {
          background(catalogue.refetch(), 'catalogue.refetch_failed');
        },
      },
    };
  const data = catalogue.data;
  const candidates = scopedComputers(data, props.scope).flatMap((computer) =>
    computer.models.map((model) =>
      nativeCandidate({ computer, model }, { catalogue: data, props, favorites, owner, client }),
    ),
  );
  return { candidates, status: null };
}

function scopedComputers(
  catalogue: EngineCatalogue,
  scope: ComputerEngine | undefined,
): readonly EngineComputer[] {
  if (scope === undefined) return catalogue.computers;
  return catalogue.computers.filter(
    (row) => row.runtime === scope.kind && row.device_id === scope.device_id,
  );
}

function canPickNative(chosen: NativeSupply | undefined, context: CandidateContext): boolean {
  if (!context.owner || context.props.onPick === null) return false;
  if (context.props.onNativeNeeded !== undefined) return true;
  return isPickableSupply(chosen, context.props.picked?.engine);
}

function isPickableSupply(
  supply: NativeSupply | undefined,
  previous: Engine | undefined,
): supply is NativeSupply {
  return supply !== undefined && nativeSupplyOptionReason(supply, previous) === null;
}

function pickNative(
  chosen: NativeSupply | undefined,
  request: NativeModelRequest,
  context: CandidateContext,
): void {
  const { owner, props } = context;
  if (!owner || props.onPick === null || props.valid?.() === false) return;
  const current = currentSupply(context.client, chosen, request);
  const previous = props.picked?.engine;
  if (!isPickableSupply(current, previous)) {
    props.onNativeNeeded?.(request);
    return;
  }
  const engine = nativeSupplyEngine(current, previous);
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
