import type { AiModelKind } from '@smarteverything/domain';
import { aiModelsKeys } from '../../../queries/keys';
import { count } from '../../../format/number';
import { matchesQuery } from './model-choice';
import type { ListItem } from './model-list';
import { useModelPages, useModelProviders, useSuggestedModels } from './model-queries';
import { useWorkerModels, type WorkerEngine } from './engine-models';
import { suggestedItems } from './suggested-items';

export type PickerView =
  | { readonly kind: 'suggested' }
  | { readonly kind: 'providers' }
  | { readonly kind: 'provider'; readonly provider: string; readonly name: string };

export interface ViewData {
  readonly items: readonly ListItem[];
  readonly loading: boolean;
  readonly error: unknown;
  readonly retry: () => void;
  readonly more: (() => void) | null;
  readonly empty: string;
}

const NO_DATA: Omit<ViewData, 'items' | 'retry'> = {
  loading: false,
  error: null,
  more: null,
  empty: '',
};

export function useSuggestedView(
  kind: AiModelKind,
  current: string | null,
  enabled: boolean,
  openProviders: () => void,
): ViewData {
  const query = useSuggestedModels(kind, current, enabled);
  return {
    ...NO_DATA,
    items: query.data === undefined ? [] : suggestedItems(query.data, current, openProviders),
    loading: query.isPending && enabled,
    error: query.error,
    retry: (): void => void query.refetch(),
  };
}

export function useSearchView(kind: AiModelKind, query: string, enabled: boolean): ViewData {
  const pages = useModelPages(aiModelsKeys.search(kind, query), { kind, q: query }, enabled);
  return {
    items: pages.models.map((model): ListItem => ({ type: 'model', key: model.id, model })),
    loading: pages.loading && enabled,
    error: pages.error,
    retry: pages.retry,
    more: pages.more,
    empty: `No model matches “${query}”.`,
  };
}

export function useProvidersView(
  kind: AiModelKind,
  enabled: boolean,
  open: (provider: string, name: string) => void,
): ViewData {
  const query = useModelProviders(kind, enabled);
  return {
    ...NO_DATA,
    items: (query.data ?? []).map((entry): ListItem => ({
      type: 'link',
      key: entry.provider,
      title: entry.name,
      detail: count(entry.count),
      provider: entry.provider,
      onPress: (): void => {
        open(entry.provider, entry.name);
      },
    })),
    loading: query.isPending && enabled,
    error: query.error,
    retry: (): void => void query.refetch(),
  };
}

export function useProviderView(kind: AiModelKind, provider: string | null): ViewData {
  const pages = useModelPages(
    aiModelsKeys.provider(kind, provider ?? ''),
    { kind, provider: provider ?? '' },
    provider !== null,
  );
  return {
    items: pages.models.map((model): ListItem => ({ type: 'model', key: model.id, model })),
    loading: pages.loading && provider !== null,
    error: pages.error,
    retry: pages.retry,
    more: pages.more,
    empty: 'No models from this maker right now.',
  };
}

export function useWorkerView(kind: WorkerEngine | null, query: string): ViewData {
  const models = useWorkerModels(kind ?? 'openrouter');
  const shown = (models.data?.models ?? []).filter(
    (model) => query === '' || matchesQuery(model, query),
  );
  return {
    ...NO_DATA,
    items:
      shown.length === 0
        ? []
        : [
            { type: 'header', key: 'plan', title: 'Included with your plan' },
            ...shown.map((model): ListItem => ({ type: 'model', key: model.id, model })),
          ],
    loading: models.isPending && kind !== null,
    error: models.error,
    retry: (): void => void models.refetch(),
    empty: query === '' ? 'This app reported no models.' : `No model matches “${query}”.`,
  };
}
