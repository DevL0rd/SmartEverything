import type { ModelChoice } from './model-choice';
import type { ListItem } from './model-list';
import type { ReactNode } from 'react';
export interface ModelCandidate {
  readonly key: string;
  readonly model: ModelChoice;
  readonly selected: boolean;
  readonly favourite: boolean;
  readonly render: () => ReactNode;
  readonly pick: (() => void) | null;
}
export interface CandidateSource {
  readonly candidates: readonly ModelCandidate[];
  readonly status: ReactNode;
}
function section(key: string, title: string, rows: readonly ModelCandidate[]): readonly ListItem[] {
  return [
    { type: 'header', key: `${key}:header`, title },
    ...rows.map((row): ListItem => ({
      type: 'custom',
      key: `${key}:${row.key}`,
      render: row.render,
    })),
  ];
}
export function candidateItems(
  candidates: readonly ModelCandidate[],
  query: string,
  total: number | null,
): readonly ListItem[] {
  const distinct = [...new Map(candidates.map((row) => [row.key, row])).values()];
  const current = distinct.filter((row) => row.selected);
  const favorites = distinct.filter((row) => row.favourite && !row.selected);
  const seen = new Set([...current, ...favorites].map((row) => row.key));
  const all = distinct.filter(
    (row) =>
      !seen.has(row.key) &&
      `${row.model.name} ${row.model.id} ${row.model.providerLabel}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const count =
    total === null
      ? `${String(all.length)} loaded`
      : `${String(all.length)} loaded · ${String(total)} OpenRouter results`;
  return [
    ...section('current', 'Current', current),
    ...section('favorites', 'Favorites', favorites),
    ...(favorites.length > 0
      ? []
      : [
          {
            type: 'header' as const,
            key: 'favorites:empty',
            title: 'Star a model to keep it here',
          },
        ]),
    ...section('all', `All models · ${count}`, all),
  ];
}
