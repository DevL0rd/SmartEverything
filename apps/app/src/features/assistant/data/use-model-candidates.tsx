import type { ReactNode } from 'react';
import type { AiModelKind } from '@smarteverything/domain';
import { aiModelsKeys } from '../../../queries/keys';
import { useEngineAccessory } from '../chats/engine-accessories';
import {
  choiceOf,
  defaultChoiceOf,
  keptEffort,
  type ModelChoice,
  type ModelPick,
} from '../picker/model-choice';
import { useModelChoice } from '../picker/model-label';
import { useModelPages, useSuggestedModels, type ModelPages } from '../picker/model-queries';
import { ModelRow } from '../picker/model-row';
import { usePickerSession } from '../picker/model-search-session';
import { isComputerEngine, nativeModelKey } from '../provider/computer-engine';
import { useHarnessPicker } from '../provider/harness-picker';
import { useSubscriptionPicker } from '../provider/subscription-models';
import { useFavouriteModels } from './favourites';
import {
  mergeCandidates,
  type ModelCandidate,
  type ModelPickerProps,
  type SourceStatus,
} from './model-candidates';

export interface ModelCandidatesContext {
  readonly props: ModelPickerProps;
  readonly query: string;
  readonly catalogue?: ModelPages;
  readonly enabled?: boolean;
}

export interface ModelCandidatesResult {
  readonly candidates: readonly ModelCandidate[];
  readonly current: ModelChoice | null;
  readonly pages: ModelPages;
  readonly native: SourceStatus | null;
  readonly routes: SourceStatus | null;
}

type Favourites = ReturnType<typeof useFavouriteModels>;

function catalogueCandidates(
  models: readonly ModelChoice[],
  props: ModelPickerProps,
  favourites: Favourites,
): readonly ModelCandidate[] {
  const native = props.picked?.engine !== undefined && props.picked.engine.kind !== 'openrouter';
  return models.map((model) => {
    const selected = !native && props.picked?.model === model.id;
    const favourite = favourites.status === 'ready' && favourites.favourites.has(model.id);
    const onPick = props.onPick;
    const pick =
      onPick === null
        ? null
        : (): void => {
            onPick({ model: model.id, effort: keptEffort(model, props.picked?.effort ?? null) });
          };
    return {
      pick,
      key: `catalogue:${model.catalogueSupplier ?? 'openrouter'}:${model.id}`,
      model,
      selected,
      favourite,
      render: (): ReactNode => (
        <ModelRow
          model={model}
          selected={selected}
          favourite={favourite}
          onPick={pick}
          onFavourite={
            favourites.status === 'ready'
              ? (): void => {
                  favourites.toggle(model.id);
                }
              : null
          }
        />
      ),
    };
  });
}

function unknownModel(picked: ModelPick, billing?: string): ModelChoice {
  return {
    id: picked.model,
    name: picked.model,
    provider: '',
    providerLabel: 'Unknown maker',
    ...(billing === undefined ? { supplierLabel: 'OpenRouter' } : { billing }),
    contextLength: null,
    price: { inputPerMillion: null, outputPerMillion: null, variable: false },
    efforts: [],
    latest: false,
    inputs: [],
    outputs: [],
  };
}

function isCatalogueEngine(picked: ModelPick | null): boolean {
  return picked?.engine === undefined || picked.engine.kind === 'openrouter';
}

function catalogueModelId(picked: ModelPick | null): string | null {
  return isCatalogueEngine(picked) || picked?.engine?.kind === 'dsh'
    ? (picked?.model ?? null)
    : null;
}

function retainedChoice(
  picked: ModelPick | null,
  current: ModelChoice | null,
): readonly ModelChoice[] {
  if (picked === null || picked.engine?.kind === 'claude' || picked.engine?.kind === 'codex')
    return [];
  return [current ?? unknownModel(picked)];
}

function catalogueModels(
  picked: ModelPick | null,
  current: ModelChoice | null,
  suggested: ReturnType<typeof useSuggestedModels>['data'],
  pages: readonly ModelChoice[],
): readonly ModelChoice[] {
  const auto =
    suggested === undefined ? null : defaultChoiceOf(suggested.default, suggested.default_model);
  return [
    ...retainedChoice(picked, current),
    ...(auto === null ? [] : [auto]),
    ...(suggested?.favourites.map(choiceOf) ?? []),
    ...pages,
  ];
}

function retainedKey(picked: ModelPick): string {
  const engine = picked.engine;
  if (engine?.kind === 'dsh') return `dsh:${engine.model_route_id}:${picked.model}`;
  if (engine !== undefined && isComputerEngine(engine))
    return nativeModelKey(engine.kind, picked.model);
  return `catalogue:openrouter:${picked.model}`;
}

function retainCurrent(
  candidates: readonly ModelCandidate[],
  picked: ModelPick | null,
  current: ModelChoice | null,
): readonly ModelCandidate[] {
  if (picked === null || candidates.some((row) => row.selected)) return candidates;
  const kind = picked.engine?.kind;
  const subscription = kind === 'claude' || kind === 'codex';
  const model = current ?? unknownModel(picked, subscription ? 'Subscription' : 'Unknown');
  return [
    {
      key: retainedKey(picked),
      pick: null,
      model,
      selected: true,
      favourite: false,
      render: (): ReactNode => (
        <ModelRow model={model} selected favourite={false} onPick={null} onFavourite={null} />
      ),
    },
    ...candidates,
  ];
}

function guarded(props: ModelPickerProps, valid: () => boolean): ModelPickerProps {
  const { onPick, onNativeNeeded } = props;
  return {
    ...props,
    onPick:
      onPick === null
        ? null
        : (pick): void => {
            if (valid()) onPick(pick);
          },
    onNativeNeeded:
      onNativeNeeded === undefined
        ? undefined
        : (request): void => {
            if (valid()) onNativeNeeded(request);
          },
  };
}

function guardedFavourites(favourites: Favourites, valid: () => boolean): Favourites {
  if (favourites.status !== 'ready') return favourites;
  return {
    ...favourites,
    toggle: (id): void => {
      if (valid()) favourites.toggle(id);
    },
  };
}

function useCurrentChoice(picked: ModelPick | null): ModelChoice | null {
  const currentId = catalogueModelId(picked);
  const available = useModelChoice(currentId);
  return currentId === null ? null : available;
}

function useCataloguePages(context: ModelCandidatesContext, ready: boolean): ModelPages {
  const { props, query, catalogue, enabled = true } = context;
  const kind = props.kind ?? 'chat';
  const own = useModelPages(
    aiModelsKeys.search(kind, query),
    { kind, ...(query === '' ? {} : { q: query }) },
    catalogue === undefined && enabled && ready,
  );
  return catalogue ?? own;
}

export function useModelCandidates(context: ModelCandidatesContext): ModelCandidatesResult {
  const session = usePickerSession();
  const props = guarded(context.props, session.valid);
  const { kind = 'chat', picked } = props;
  const current = useCurrentChoice(picked);
  const favourites = guardedFavourites(useFavouriteModels(), session.valid);
  const suggested = useSuggestedModels(kind, catalogueModelId(picked));
  const pages = useCataloguePages(context, session.ready);
  const accessory = useEngineAccessory();
  const native = useSubscriptionPicker(
    {
      ...props,
      valid: session.valid,
      onNativeNeeded: props.onNativeNeeded ?? accessory?.request,
    },
    kind === 'chat',
  );
  const models = catalogueModels(picked, current, suggested.data, pages.models);
  const routes = useHarnessPicker({ ...props, models, valid: session.valid }, kind === 'chat');
  const catalogue = catalogueCandidates(
    catalogueSourceModels(kind, models),
    kind === 'chat' ? { ...props, onPick: null } : props,
    favourites,
  );
  return {
    candidates: retainCurrent(
      mergeCandidates({ native: native.candidates, routes: routes.candidates, catalogue }),
      picked,
      current,
    ),
    current,
    pages,
    native: native.status,
    routes: routes.status,
  };
}

function catalogueSourceModels(
  kind: AiModelKind,
  models: readonly ModelChoice[],
): readonly ModelChoice[] {
  return kind === 'chat' ? models.filter((model) => model.catalogueSupplier !== undefined) : models;
}
