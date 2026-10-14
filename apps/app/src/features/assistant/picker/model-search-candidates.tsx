import type { ReactNode } from 'react';
import { Text } from '../../../components/text';
import { ModelRow } from './model-row';
import type { ModelCandidate } from './model-candidates';
import type { ModelChoice } from './model-choice';
import type { ListItem } from './model-list';
import { nativeMatches, type SearchQuery } from './model-search-filters';
export interface SearchCandidates {
  readonly current: readonly ModelCandidate[];
  readonly favorites: readonly ModelCandidate[];
  readonly all: readonly ModelCandidate[];
  readonly nativeCount: number;
}
function unavailableCandidate(model: ModelChoice): ModelCandidate {
  return {
    key: `catalogue:${model.catalogueSupplier ?? 'unknown'}:${model.id}`,
    model,
    pick: null,
    selected: false,
    favourite: false,
    render: (): ReactNode => (
      <ModelRow model={model} selected={false} favourite={false} onPick={null} onFavourite={null} />
    ),
  };
}
export function searchCandidates(
  candidates: readonly ModelCandidate[],
  models: readonly ModelChoice[],
  query: SearchQuery,
): SearchCandidates {
  const distinct = [...new Map(candidates.map((row) => [row.key, row])).values()];
  const current = distinct.filter((row) => row.selected);
  const favorites = distinct.filter((row) => row.favourite && !row.selected);
  const retained = new Set([...current, ...favorites].map((row) => row.key));
  const native = distinct.filter(
    (row) => row.model.catalogueSupplier === undefined && nativeMatches(row.model, query),
  );
  const catalogue = models.flatMap((model) => {
    const routes = distinct.filter(
      (row) => row.model.id === model.id && row.model.catalogueSupplier === model.catalogueSupplier,
    );
    return routes.length === 0 ? [unavailableCandidate(model)] : routes;
  });
  const all = [
    ...new Map(
      [...native, ...catalogue]
        .filter((row) => !retained.has(row.key))
        .map((row) => [row.key, row]),
    ).values(),
  ];
  return { current, favorites, all, nativeCount: native.length };
}
function section(key: string, title: string, rows: readonly ModelCandidate[]): readonly ListItem[] {
  return [
    { type: 'header', key: `${key}:header`, title },
    ...rows.map((row): ListItem => ({ type: 'custom', key: row.key, render: row.render })),
  ];
}
export function retainedSearchItems(rows: SearchCandidates): readonly ListItem[] {
  return [
    ...section('current', 'Current', rows.current),
    ...section('favorites', 'Favorites', rows.favorites),
    ...(rows.favorites.length > 0
      ? []
      : [
          {
            type: 'custom' as const,
            key: 'favorites:empty',
            render: (): ReactNode => (
              <Text variant="caption" tone="variant" className="px-3 py-2">
                Star models to keep them here.
              </Text>
            ),
          },
        ]),
  ];
}
export function allSearchItems(rows: SearchCandidates): readonly ListItem[] {
  return rows.all.map((row): ListItem => ({ type: 'custom', key: row.key, render: row.render }));
}
