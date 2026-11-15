import { plural } from '../../../format/text';
import type { FileNode } from '../source/types';

export interface FileSelection {
  readonly keys: ReadonlySet<string>;
  readonly anchor: string | null;
  readonly focus: string | null;
}

export const NO_SELECTION: FileSelection = { keys: new Set(), anchor: null, focus: null };

export function selectOne(key: string): FileSelection {
  return { keys: new Set([key]), anchor: key, focus: key };
}

export function focusOn(selection: FileSelection, key: string): FileSelection {
  if (selection.focus === key) return selection;
  return { ...selection, focus: key };
}

export function toggleOne(selection: FileSelection, key: string): FileSelection {
  const keys = new Set(selection.keys);
  if (!keys.delete(key)) keys.add(key);
  return { keys, anchor: key, focus: key };
}

export function selectRange(
  selection: FileSelection,
  order: readonly string[],
  key: string,
): FileSelection {
  const from = selection.anchor === null ? -1 : order.indexOf(selection.anchor);
  const to = order.indexOf(key);
  if (from === -1 || to === -1 || selection.anchor === null) return selectOne(key);
  const [low, high] = from <= to ? [from, to] : [to, from];
  return { keys: new Set(order.slice(low, high + 1)), anchor: selection.anchor, focus: key };
}

export function selectAllOf(order: readonly string[]): FileSelection {
  return { keys: new Set(order), anchor: order[0] ?? null, focus: order.at(-1) ?? null };
}

function focusIndex(selection: FileSelection, order: readonly string[], step: number): number {
  const at = selection.focus === null ? -1 : order.indexOf(selection.focus);
  if (at === -1) return step > 0 ? 0 : order.length - 1;
  return Math.min(Math.max(at + step, 0), order.length - 1);
}

export function moveFocus(
  selection: FileSelection,
  order: readonly string[],
  step: number,
  extend: boolean,
): FileSelection {
  const target = order[focusIndex(selection, order, step)];
  if (target === undefined) return selection;
  return extend ? selectRange(selection, order, target) : selectOne(target);
}

export type TapMode = 'toggle' | 'range' | 'single';

export interface TapInput {
  readonly shift: boolean;
  readonly toggle: boolean;
  readonly selecting: boolean;
}

export function tapModeOf({ shift, toggle, selecting }: TapInput): TapMode {
  if (shift) return 'range';
  if (toggle || selecting) return 'toggle';
  return 'single';
}

export function tapped(
  selection: FileSelection,
  order: readonly string[],
  key: string,
  mode: TapMode,
): FileSelection {
  switch (mode) {
    case 'range':
      return selectRange(selection, order, key);
    case 'toggle':
      return toggleOne(selection, key);
    case 'single':
      return selectOne(key);
  }
}

export function keptIn(selection: FileSelection, order: readonly string[]): FileSelection {
  const present = new Set(order);
  const keys = [...selection.keys].filter((key) => present.has(key));
  if (keys.length === selection.keys.size) return selection;
  const keep = (key: string | null): string | null =>
    key !== null && present.has(key) ? key : null;
  return { keys: new Set(keys), anchor: keep(selection.anchor), focus: keep(selection.focus) };
}

export function pickedOf<O>(
  nodes: readonly FileNode<O>[],
  selection: FileSelection,
): readonly FileNode<O>[] {
  return nodes.filter((node) => selection.keys.has(node.key));
}

export function focusedOf<O>(
  nodes: readonly FileNode<O>[],
  selection: FileSelection,
): FileNode<O> | null {
  return nodes.find((node) => node.key === selection.focus) ?? null;
}

export type PressMode = 'pick' | 'open';

export function pressModeOf<O>(
  nodes: readonly FileNode<O>[],
  selection: FileSelection,
  shift: boolean,
): PressMode {
  return shift || pickedOf(nodes, selection).length > 0 ? 'pick' : 'open';
}

export function selectionLabelOf(selected: number): string {
  return `${plural(selected, 'item')} selected`;
}

export interface ScrollWindow {
  readonly offset: number;
  readonly viewport: number;
}

export function revealOffset(
  index: number,
  rowHeight: number,
  window: ScrollWindow,
): number | null {
  const top = index * rowHeight;
  if (top < window.offset) return top;
  const bottom = top + rowHeight;
  return bottom > window.offset + window.viewport ? bottom - window.viewport : null;
}
