import { indexProgram } from '@smarteverything/flow/program/lookup';
import type { Program } from '@smarteverything/flow/program/walk';

export interface Selection {
  readonly ids: readonly string[];
  readonly anchor: string | null;
}

export const EMPTY_SELECTION: Selection = { ids: [], anchor: null };

export function programOrder(program: Program): readonly string[] {
  return [...indexProgram(program).byId.keys()];
}

export function isSelected(selection: Selection, id: string): boolean {
  return selection.ids.includes(id);
}

export function selectOnly(selection: Selection, id: string): Selection {
  if (selection.ids.length === 1 && selection.anchor === id && selection.ids[0] === id) {
    return selection;
  }
  return { ids: [id], anchor: id };
}

export function toggle(selection: Selection, id: string): Selection {
  if (isSelected(selection, id)) {
    const ids = selection.ids.filter((candidate) => candidate !== id);
    return { ids, anchor: ids.at(-1) ?? null };
  }
  return { ids: [...selection.ids, id], anchor: id };
}

export function extendTo(selection: Selection, order: readonly string[], id: string): Selection {
  const from = selection.anchor === null ? -1 : order.indexOf(selection.anchor);
  const to = order.indexOf(id);
  if (from < 0 || to < 0) return selectOnly(selection, id);
  const range = order.slice(Math.min(from, to), Math.max(from, to) + 1);
  const kept = selection.ids.filter((candidate) => !range.includes(candidate));
  return { ids: [...kept, ...range], anchor: selection.anchor };
}

export function selectAll(selection: Selection, order: readonly string[]): Selection {
  const last = order.at(-1);
  if (last === undefined) return clearSelection(selection);
  if (order.length === selection.ids.length && order.every((id) => isSelected(selection, id))) {
    return selection;
  }
  return { ids: [...order], anchor: last };
}

export function clearSelection(selection: Selection): Selection {
  return selection.ids.length === 0 && selection.anchor === null ? selection : EMPTY_SELECTION;
}

export function pruneSelection(selection: Selection, existing: ReadonlySet<string>): Selection {
  const ids = selection.ids.filter((id) => existing.has(id));
  if (ids.length === selection.ids.length) return selection;
  const anchor =
    selection.anchor !== null && existing.has(selection.anchor)
      ? selection.anchor
      : (ids.at(-1) ?? null);
  return { ids, anchor };
}
