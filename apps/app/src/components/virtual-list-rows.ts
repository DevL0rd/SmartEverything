export interface VirtualSection<T> {
  readonly key: string;
  readonly title: string | null;
  readonly data: readonly T[];
}

interface HeaderRow {
  readonly kind: 'header';
  readonly key: string;
  readonly title: string;
}

interface ItemRow<T> {
  readonly kind: 'item';
  readonly key: string;
  readonly item: T;
}

export type ListRow<T> = HeaderRow | ItemRow<T>;

export function flattenSections<T>(
  sections: readonly VirtualSection<T>[],
  keyOf: (item: T) => string,
): readonly ListRow<T>[] {
  return sections.flatMap((section) => [
    ...(section.title === null
      ? []
      : [{ kind: 'header' as const, key: `${section.key}:header`, title: section.title }]),
    ...section.data.map((item) => ({
      kind: 'item' as const,
      key: `${section.key}:${keyOf(item)}`,
      item,
    })),
  ]);
}

export function indexOfItem<T>(
  rows: readonly ListRow<T>[],
  keyOf: (item: T) => string,
  itemKey: string,
): number {
  return rows.findIndex((row) => row.kind === 'item' && keyOf(row.item) === itemKey);
}

export function headerIndices(rows: readonly ListRow<unknown>[]): number[] {
  return rows.flatMap((row, index) => (row.kind === 'header' ? [index] : []));
}

function sameRowContent<T>(
  left: ListRow<T>,
  right: ListRow<T>,
  sameItem: (left: T, right: T) => boolean,
): boolean {
  if (left.kind === 'header') return right.kind === 'header' && left.title === right.title;
  return right.kind === 'item' && sameItem(left.item, right.item);
}

export function reuseRows<T>(
  previous: readonly ListRow<T>[],
  next: readonly ListRow<T>[],
  sameItem: (left: T, right: T) => boolean,
): readonly ListRow<T>[] {
  const known = new Map(previous.map((row) => [row.key, row] as const));
  const merged = next.map((row) => {
    const old = known.get(row.key);
    return old !== undefined && sameRowContent(old, row, sameItem) ? old : row;
  });
  const unchanged =
    merged.length === previous.length && merged.every((row, index) => row === previous[index]);
  return unchanged ? previous : merged;
}
