import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { AiModelKind } from '@smarteverything/domain';
import { SearchField } from '../../../components/search-field';
import { useDebouncedValue } from '../../../design/use-debounced-value';
import { Text } from '../../../components/text';
import { aiModelsKeys } from '../../../queries/keys';
import { useFavouriteModels } from '../data/favourites';
import { useHarnessPicker } from '../provider/harness-picker';
import { isComputerEngine, nativeModelKey } from '../provider/computer-engine';
import { useSubscriptionPicker, type NativeModelRequest } from '../provider/subscription-models';
import { useEngineAccessory } from '../chats/engine-accessories';
import {
  choiceOf,
  defaultChoiceOf,
  keptEffort,
  type ModelChoice,
  type ModelPick,
} from './model-choice';
import { candidateItems, type ModelCandidate } from './model-candidates';
import { useModelPages, useSuggestedModels, type ModelPages } from './model-queries';
import { usePickerSession } from './model-search-session';
import { useModelChoice } from './model-label';
import { ModelList, type ListItem } from './model-list';
import { ModelRow } from './model-row';
import { ModelsUnavailable } from './models-unavailable';

const SEARCH_DELAY_MS = 200;
export interface ModelPickerProps {
  readonly kind?: AiModelKind;
  readonly initialQuery?: string;
  readonly picked: ModelPick | null;
  readonly onPick: ((pick: ModelPick) => void) | null;
  readonly onNativeNeeded?: ((request: NativeModelRequest) => void) | undefined;
}
function openrouterCandidates(
  models: readonly ModelChoice[],
  props: ModelPickerProps,
  favorites: ReturnType<typeof useFavouriteModels>,
): readonly ModelCandidate[] {
  const native = props.picked?.engine !== undefined && props.picked.engine.kind !== 'openrouter';
  return models.map((model) => {
    const selected = !native && props.picked?.model === model.id;
    const favourite = favorites.status === 'ready' && favorites.favourites.has(model.id);
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
            favorites.status === 'ready'
              ? (): void => {
                  favorites.toggle(model.id);
                }
              : null
          }
        />
      ),
    };
  });
}
function retainedChoice(
  picked: ModelPick | null,
  current: ModelChoice | null,
): readonly ModelChoice[] {
  if (picked === null || picked.engine?.kind === 'claude' || picked.engine?.kind === 'codex')
    return [];
  return [
    current ?? {
      id: picked.model,
      name: picked.model,
      provider: '',
      providerLabel: 'Unknown maker',
      supplierLabel: 'OpenRouter',
      contextLength: null,
      price: { inputPerMillion: null, outputPerMillion: null, variable: false },
      efforts: [],
      latest: false,
      inputs: [],
      outputs: [],
    },
  ];
}
export function usePickerData(
  props: ModelPickerProps,
  query: string,
  catalogue?: ModelPages,
  enabled = true,
): PickerData {
  const session = usePickerSession();
  const guarded = guardedPicker(props, session.valid);
  const { kind = 'chat', picked } = props;
  const availableCurrent = useModelChoice(openrouterId(picked));
  const current = openrouterId(picked) === null ? null : availableCurrent;
  const favorites = guardedFavorites(useFavouriteModels(), session.valid);
  const suggested = useSuggestedModels(kind, openrouterId(picked));
  const legacyPages = useModelPages(
    aiModelsKeys.search(kind, query),
    { kind, ...(query === '' ? {} : { q: query }) },
    catalogue === undefined && enabled && session.ready,
  );
  const pages = catalogue ?? legacyPages;
  const accessory = useEngineAccessory();
  const native = useSubscriptionPicker(
    { ...guarded, valid: session.valid, onNativeNeeded: nativeRequestHandler(guarded, accessory) },
    kind === 'chat',
  );
  const models = openrouterModels(picked, current, suggested.data, pages.models);
  const harness = useHarnessPicker({ ...guarded, models, valid: session.valid }, kind === 'chat');
  const candidates = retainCurrent(
    [
      ...native.candidates,
      ...harness.candidates,
      ...catalogueCandidates({
        kind,
        models,
        props: guarded,
        favorites,
        routed: harness.candidates,
      }),
    ],
    picked,
    current,
  );
  const items = candidateItems(candidates, query, pages.total);
  return { items, candidates, current, pages, native, harness };
}
export interface PickerData {
  readonly items: readonly ListItem[];
  readonly candidates: readonly ModelCandidate[];
  readonly current: ModelChoice | null;
  readonly pages: ReturnType<typeof useModelPages>;
  readonly native: ReturnType<typeof useSubscriptionPicker>;
  readonly harness: ReturnType<typeof useHarnessPicker>;
}
function CatalogueStatus({ data }: { readonly data: PickerData }): ReactNode {
  const { native, harness, pages, current } = data;
  return (
    <>
      {native.status}
      {harness.status}
      {pages.error === null ? null : (
        <ModelsUnavailable keeping={current?.name ?? 'its current model'} retry={pages.retry} />
      )}
      {pages.models.length === 0 && !pages.loading && pages.error === null ? (
        <Text tone="variant" className="px-3 py-4">
          No models match this search.
        </Text>
      ) : null}
    </>
  );
}
export function ModelPicker(props: ModelPickerProps): ReactNode {
  const [text, setText] = useState(props.initialQuery ?? '');
  const query = useDebouncedValue(text.trim(), SEARCH_DELAY_MS);
  const data = usePickerData(props, query);
  return (
    <View className="min-h-0 flex-1 gap-2">
      <SearchField
        value={text}
        onChange={setText}
        placeholder="Search models"
        variant="field"
        focusOnMount={props.initialQuery !== undefined}
      />
      <ModelList
        items={[
          ...data.items,
          {
            type: 'custom',
            key: 'sources:status',
            render: (): ReactNode => <CatalogueStatus data={data} />,
          },
        ]}
        selected={null}
        favourites={new Set()}
        onFavourite={null}
        onPick={null}
        onEnd={data.pages.more}
        loading={data.pages.loading}
      />
    </View>
  );
}

function retainCurrent(
  candidates: readonly ModelCandidate[],
  picked: ModelPick | null,
  current: ModelChoice | null,
): readonly ModelCandidate[] {
  if (picked === null || candidates.some((row) => row.selected)) return candidates;
  const model = current ?? {
    id: picked.model,
    name: picked.model,
    provider: '',
    providerLabel: 'Unknown maker',
    billing: nativeBilling(picked),
    contextLength: null,
    price: { inputPerMillion: null, outputPerMillion: null, variable: false },
    efforts: [],
    latest: false,
    inputs: [],
    outputs: [],
  };
  return [
    {
      key: retainedCurrentKey(picked),
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

function isOpenrouterPick(picked: ModelPick | null): boolean {
  return picked?.engine === undefined || picked.engine.kind === 'openrouter';
}
function openrouterId(picked: ModelPick | null): string | null {
  return isOpenrouterPick(picked) || picked?.engine?.kind === 'dsh'
    ? (picked?.model ?? null)
    : null;
}
function nativeRequestHandler(
  props: ModelPickerProps,
  accessory: ReturnType<typeof useEngineAccessory>,
): ModelPickerProps['onNativeNeeded'] {
  return props.onNativeNeeded ?? accessory?.request;
}
function openrouterModels(
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

function guardedPicker(props: ModelPickerProps, valid: () => boolean): ModelPickerProps {
  const onPick = props.onPick;
  const onNativeNeeded = props.onNativeNeeded;
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

function nativeBilling(picked: ModelPick): string {
  const kind = picked.engine?.kind;
  return kind === 'claude' || kind === 'codex' ? 'Subscription' : 'Unknown';
}

interface CatalogueCandidates {
  readonly kind: AiModelKind;
  readonly models: readonly ModelChoice[];
  readonly props: ModelPickerProps;
  readonly favorites: ReturnType<typeof useFavouriteModels>;
  readonly routed: readonly ModelCandidate[];
}
function catalogueCandidates(context: CatalogueCandidates): readonly ModelCandidate[] {
  const props = context.kind === 'chat' ? { ...context.props, onPick: null } : context.props;
  const models =
    context.kind === 'chat'
      ? context.models.filter((model) => model.catalogueSupplier !== undefined)
      : context.models;
  return openrouterCandidates(models, props, context.favorites).filter(
    (candidate) =>
      !context.routed.some(
        (route) =>
          route.model.id === candidate.model.id &&
          route.model.catalogueSupplier === candidate.model.catalogueSupplier,
      ),
  );
}

function guardedFavorites(
  favorites: ReturnType<typeof useFavouriteModels>,
  valid: () => boolean,
): ReturnType<typeof useFavouriteModels> {
  if (favorites.status !== 'ready') return favorites;
  return {
    ...favorites,
    toggle: (id): void => {
      if (valid()) favorites.toggle(id);
    },
  };
}

function retainedCurrentKey(picked: ModelPick): string {
  const engine = picked.engine;
  if (engine?.kind === 'dsh') return `dsh:${engine.model_route_id}:${picked.model}`;
  if (engine !== undefined && isComputerEngine(engine))
    return nativeModelKey(engine.kind, picked.model);
  return `catalogue:openrouter:${picked.model}`;
}
