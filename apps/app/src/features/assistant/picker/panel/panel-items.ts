import { appendTo, matchesModelSearchWords } from '@smarteverything/domain';
import type { ListEntry } from '../../../../components/keyboard-list';
import type { LibraryRow } from '../library/library-rows';

export const SUGGESTED_MAX = 8;
export const SUGGESTED_BELOW = 6;
export const SEARCH_MAX = 30;
export const FAVOURITES_HINT = 'Star models to keep them here.';

export type PanelEntry =
  | { readonly type: 'header'; readonly key: string; readonly title: string }
  | { readonly type: 'hint'; readonly key: string; readonly text: string }
  | { readonly type: 'row'; readonly key: string; readonly row: LibraryRow };

export interface IdleFacts {
  readonly rows: readonly LibraryRow[];
  readonly recent: readonly string[];
  readonly machineId: string;
  readonly machineName: string | null;
}

function section(key: string, title: string, rows: readonly LibraryRow[]): readonly PanelEntry[] {
  if (rows.length === 0) return [];
  return [
    { type: 'header', key: `${key}:header`, title },
    ...rows.map((row): PanelEntry => ({ type: 'row', key: `${key}:${row.key}`, row })),
  ];
}

function distinct(rows: readonly LibraryRow[]): readonly LibraryRow[] {
  return [...new Map(rows.map((row) => [row.key, row])).values()];
}

function suggestedSection(
  facts: IdleFacts,
  rows: readonly LibraryRow[],
  taken: ReadonlySet<string>,
  filled: number,
): readonly PanelEntry[] {
  if (facts.machineName === null || filled >= SUGGESTED_BELOW) return [];
  const suggested = rows
    .filter((row) => !taken.has(row.key) && row.sources.includes(facts.machineId))
    .slice(0, SUGGESTED_MAX);
  return section('suggested', `Suggested for ${facts.machineName}`, suggested);
}

export function idleEntries(facts: IdleFacts): readonly PanelEntry[] {
  const rows = distinct(facts.rows);
  const current = rows.filter((row) => row.candidate.selected);
  const favourites = rows.filter((row) => row.candidate.favourite && !row.candidate.selected);
  const shown = new Set([...current, ...favourites].map((row) => row.key));
  const recent = facts.recent.flatMap((id) => {
    const row = rows.find((entry) => entry.favouriteId === id && !shown.has(entry.key));
    return row === undefined ? [] : [row];
  });
  const taken = new Set([...shown, ...recent.map((row) => row.key)]);
  return [
    ...section('current', 'Current', current),
    ...(favourites.length === 0
      ? [
          { type: 'header' as const, key: 'favourites:header', title: 'Favourites' },
          { type: 'hint' as const, key: 'favourites:hint', text: FAVOURITES_HINT },
        ]
      : section('favourites', 'Favourites', favourites)),
    ...section('recent', 'Recent', recent),
    ...suggestedSection(facts, rows, taken, favourites.length + recent.length),
  ];
}

export interface SearchFacts {
  readonly rows: readonly LibraryRow[];
  readonly groupName: (sourceId: string) => string;
}

export function searchEntries(facts: SearchFacts): readonly PanelEntry[] {
  const shown = distinct(facts.rows).slice(0, SEARCH_MAX);
  const groups = new Map<string, LibraryRow[]>();
  for (const row of shown) {
    const id = row.sources[0] ?? '';
    appendTo(groups, id, row);
  }
  return [...groups].flatMap(([id, rows]) =>
    section(`group:${id}`, id === '' ? 'Not available' : `On ${facts.groupName(id)}`, rows),
  );
}

export function searchRows(
  candidates: readonly LibraryRow[],
  found: readonly LibraryRow[],
  text: string,
): readonly LibraryRow[] {
  const local = candidates.filter((row) =>
    matchesModelSearchWords(
      {
        id: row.candidate.model.id,
        name: row.candidate.model.name,
        author_name: row.candidate.model.providerLabel,
      },
      text,
    ),
  );
  return distinct([...local, ...found]);
}

export function rowEntries(entries: readonly PanelEntry[]): readonly LibraryRow[] {
  return entries.flatMap((entry) => (entry.type === 'row' ? [entry.row] : []));
}

export function libraryMoreTitle(input: {
  readonly total: number | null;
  readonly shown: number;
  readonly searching: boolean;
}): string | null {
  const { total, shown, searching } = input;
  if (total !== null) return total > shown ? `Show all ${String(total)} in the library` : null;
  return searching && shown >= SEARCH_MAX ? 'Show all in the library' : null;
}

export function keyboardItems(input: {
  readonly rows: readonly LibraryRow[];
  readonly blocked: boolean;
  readonly searching: boolean;
  readonly hasThinking: boolean;
}): readonly ListEntry[] {
  const items = input.rows.map((row) => ({ id: row.key, disabled: row.candidate.pick === null }));
  if (input.searching) return items;
  return [
    { id: 'machine' },
    ...(input.hasThinking ? [{ id: 'thinking', disabled: input.blocked }] : []),
    ...items,
  ];
}
