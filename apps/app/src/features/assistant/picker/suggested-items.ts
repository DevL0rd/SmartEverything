import {
  AUTO_LATEST_GEMINI_FLASH,
  type AiModelRow,
  type AiModelSuggested,
} from '@smarteverything/domain';
import { defaultChoiceOf, choiceOf, type ModelChoice } from './model-choice';
import type { ListItem } from './model-list';

function section(key: string, title: string, models: readonly ModelChoice[]): readonly ListItem[] {
  if (models.length === 0) {
    return [];
  }
  return [
    { type: 'header', key: `${key}-header`, title },
    ...models.map((model): ListItem => ({ type: 'model', key: `${key}-${model.id}`, model })),
  ];
}

function rowsOf(rows: readonly AiModelRow[]): readonly ModelChoice[] {
  return rows.map(choiceOf);
}

function identityOf(model: ModelChoice, data: AiModelSuggested): string {
  const concrete = data.default_model;
  return model.id === AUTO_LATEST_GEMINI_FLASH && concrete !== null ? concrete.id : model.id;
}

function unseen(
  models: readonly ModelChoice[],
  seen: Set<string>,
  data: AiModelSuggested,
): readonly ModelChoice[] {
  return models.filter((model) => {
    const identity = identityOf(model, data);
    const fresh = !seen.has(identity);
    seen.add(identity);
    return fresh;
  });
}

function currentOf(
  data: AiModelSuggested,
  picked: string | null,
  auto: ModelChoice | null,
): ModelChoice | null {
  if (data.current === null || (picked === AUTO_LATEST_GEMINI_FLASH && auto !== null)) {
    return auto;
  }
  return choiceOf(data.current);
}

export function suggestedItems(
  data: AiModelSuggested,
  picked: string | null,
  openProviders: () => void,
): readonly ListItem[] {
  const auto = defaultChoiceOf(data.default, data.default_model);
  const current = currentOf(data, picked, auto);
  const seen = new Set(current === null ? [] : [identityOf(current, data)]);
  const recent = unseen(rowsOf(data.recent), seen, data);
  const top = unseen([...(auto === null ? [] : [auto]), ...rowsOf(data.top_picks)], seen, data);
  return [
    ...section('current', 'Current', current === null ? [] : [current]),
    ...section('favourites', 'Favourites', rowsOf(data.favourites)),
    ...section('recent', 'Recent', recent),
    ...section('top', 'Top picks', top),
    {
      type: 'link',
      key: 'all-providers',
      title: 'All providers',
      detail: null,
      provider: null,
      onPress: openProviders,
    },
  ];
}
