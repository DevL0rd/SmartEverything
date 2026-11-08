import type { TrashItem } from './trash-model';

export type TrashSelection = ReadonlySet<string>;

export type PickState = boolean | 'mixed';

export const NOTHING_PICKED: TrashSelection = new Set();

export function togglePicked(selection: TrashSelection, id: string): TrashSelection {
  const next = new Set(selection);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function pickStateOf(selection: TrashSelection, items: readonly TrashItem[]): PickState {
  const picked = items.filter((item) => selection.has(item.id)).length;
  if (picked === 0) return false;
  return picked === items.length ? true : 'mixed';
}

export function toggleAll(selection: TrashSelection, items: readonly TrashItem[]): TrashSelection {
  return pickStateOf(selection, items) === true
    ? NOTHING_PICKED
    : new Set(items.map((item) => item.id));
}

export function pickedOf(
  items: readonly TrashItem[],
  selection: TrashSelection,
): readonly TrashItem[] {
  return items.filter((item) => selection.has(item.id));
}

export function keptPicks(selection: TrashSelection, items: readonly TrashItem[]): TrashSelection {
  const present = new Set(items.map((item) => item.id));
  const kept = [...selection].filter((id) => present.has(id));
  return kept.length === selection.size ? selection : new Set(kept);
}
