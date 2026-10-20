export type ListChange<T> =
  | { readonly kind: 'add'; readonly item: T }
  | { readonly kind: 'set'; readonly index: number; readonly item: T }
  | { readonly kind: 'remove'; readonly index: number }
  | { readonly kind: 'move'; readonly index: number; readonly by: -1 | 1 };

export function replaced<T>(items: readonly T[], index: number, item: T): T[] {
  return items.map((existing, position) => (position === index ? item : existing));
}

export function removed<T>(items: readonly T[], index: number): T[] {
  return items.filter((_, position) => position !== index);
}

export function moved<T>(items: readonly T[], index: number, by: -1 | 1): T[] {
  const target = index + by;
  const item = items[index];
  const other = items[target];
  if (item === undefined || other === undefined) {
    return [...items];
  }
  return replaced(replaced(items, index, other), target, item);
}

export function changeList<T>(items: readonly T[], change: ListChange<T>): readonly T[] {
  switch (change.kind) {
    case 'add':
      return [...items, change.item];
    case 'set':
      return replaced(items, change.index, change.item);
    case 'remove':
      return removed(items, change.index);
    case 'move':
      return moved(items, change.index, change.by);
  }
}
