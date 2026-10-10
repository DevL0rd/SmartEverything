import { useState } from 'react';
import { NO_EXPANSION, type Expansion, type SearchRow } from './result-rows';

interface Cursor {
  readonly query: string;
  readonly key: string | null;
  readonly navigating: boolean;
  readonly expansion: Expansion;
}

export interface ResultNavigation {
  readonly rows: readonly SearchRow[];
  readonly selected: SearchRow | null;
  readonly navigating: boolean;
  readonly move: (delta: number) => void;
  readonly right: () => boolean;
  readonly left: () => boolean;
  readonly toggle: (key: string, expanded: boolean) => void;
  readonly showAll: (target: string) => void;
}

function stepFrom(rows: readonly SearchRow[], index: number, delta: number): number {
  const count = rows.length;
  let next = index;
  for (let tries = 0; tries < count; tries += 1) {
    next = (next + delta + count) % count;
    if (rows[next]?.kind !== 'group') {
      return next;
    }
  }
  return index;
}

function without(set: ReadonlySet<string>, key: string): ReadonlySet<string> {
  return new Set([...set].filter((entry) => entry !== key));
}

function toggled(expansion: Expansion, key: string, expanded: boolean): Expansion {
  return expanded
    ? {
        ...expansion,
        open: without(expansion.open, key),
        closed: new Set([...expansion.closed, key]),
      }
    : {
        ...expansion,
        closed: without(expansion.closed, key),
        open: new Set([...expansion.open, key]),
      };
}

function indexOf(rows: readonly SearchRow[], key: string | null): number {
  const found = key === null ? -1 : rows.findIndex((row) => row.key === key);
  return found >= 0 ? found : rows.findIndex((row) => row.kind !== 'group');
}

interface Moves {
  readonly rows: readonly SearchRow[];
  readonly index: number;
  readonly current: Cursor;
  readonly set: (cursor: Cursor) => void;
}

function rightOf({ rows, index, current, set }: Moves): boolean {
  const row = rows[index];
  if (row?.kind !== 'node' || !row.expandable) {
    return false;
  }
  if (!row.expanded) {
    set({ ...current, key: row.key, expansion: toggled(current.expansion, row.key, false) });
    return true;
  }
  set({ ...current, key: rows[index + 1]?.key ?? row.key });
  return true;
}

function leftOf({ rows, index, current, set }: Moves): boolean {
  const row = rows[index];
  if (row === undefined || row.kind === 'group' || row.kind === 'query') {
    return false;
  }
  if (row.kind === 'node' && row.expanded) {
    set({ ...current, key: row.key, expansion: toggled(current.expansion, row.key, true) });
    return true;
  }
  const parent = row.kind === 'node' ? row.parent : row.target;
  if (parent === null || !rows.some((other) => other.key === parent && other.kind !== 'group')) {
    return false;
  }
  set({ ...current, key: parent });
  return true;
}

export function useResultNavigation(
  query: string,
  build: (expansion: Expansion) => readonly SearchRow[],
): ResultNavigation {
  const [cursor, setCursor] = useState<Cursor>({
    query,
    key: null,
    navigating: false,
    expansion: NO_EXPANSION,
  });
  const current: Cursor =
    cursor.query === query
      ? cursor
      : { query, key: null, navigating: false, expansion: NO_EXPANSION };
  const rows = build(current.expansion);
  const index = indexOf(rows, current.key);
  const set = (next: Cursor): void => {
    setCursor({ ...next, navigating: true });
  };
  const moves: Moves = { rows, index, current, set };
  return {
    rows,
    selected: rows[index] ?? null,
    navigating: current.navigating,
    move: (delta): void => {
      set({ ...current, key: rows[stepFrom(rows, index, delta)]?.key ?? null });
    },
    right: () => rightOf(moves),
    left: () => leftOf(moves),
    toggle: (key, expanded): void => {
      setCursor({ ...current, expansion: toggled(current.expansion, key, expanded) });
    },
    showAll: (target): void => {
      setCursor({
        ...current,
        expansion: { ...current.expansion, all: new Set([...current.expansion.all, target]) },
      });
    },
  };
}
