import {
  WIDGET_FOOTPRINTS,
  WIDGET_SIZES,
  type BoardClass,
  type BoardWidget,
  type WidgetSize,
} from '@smarteverything/domain';
import { aspectRows, type Cell } from '../board-geometry';
import type { WidgetDefinition } from '../types';

export const SIZE_LABELS: Readonly<Record<WidgetSize, string>> = {
  M: 'Medium',
  W: 'Wide',
  XL: 'Extra large',
};

export interface SizeOption {
  readonly size: WidgetSize;
  readonly columns: number;
  readonly rows: number;
}

function areaOf(option: SizeOption): number {
  return option.columns * option.rows;
}

function rowsFor(
  definition: WidgetDefinition,
  columns: number,
  rows: number,
  cell: Cell | undefined,
): number {
  return definition.aspect === undefined || cell === undefined
    ? rows
    : aspectRows(cell, columns, definition.aspect);
}

export function sizeOptions(
  definition: WidgetDefinition,
  board: BoardClass,
  cell?: Cell,
): readonly SizeOption[] {
  const allowed = definition.sizes[board];
  const unique = new Map<string, SizeOption>();
  for (const size of WIDGET_SIZES) {
    const footprint = WIDGET_FOOTPRINTS[board][size];
    const rows = rowsFor(definition, footprint.columns, footprint.rows, cell);
    const shape = `${String(footprint.columns)}x${String(rows)}`;
    if (allowed.includes(size) && !unique.has(shape)) {
      unique.set(shape, { size, columns: footprint.columns, rows });
    }
  }
  return [...unique.values()].sort((a, b) => areaOf(a) - areaOf(b) || a.columns - b.columns);
}

export function steppedSize(
  definition: WidgetDefinition,
  board: BoardClass,
  current: WidgetSize,
  step: 1 | -1,
): WidgetSize | null {
  const options = sizeOptions(definition, board);
  const footprint = WIDGET_FOOTPRINTS[board][current];
  const index = options.findIndex(
    (option) => option.columns === footprint.columns && option.rows === footprint.rows,
  );
  const next = options[index + step];
  return index === -1 || next === undefined ? null : next.size;
}

export function placeableSize(definition: WidgetDefinition, board: BoardClass): WidgetSize | null {
  const allowed = definition.sizes[board];
  if (allowed.includes(definition.defaultSize)) {
    return definition.defaultSize;
  }
  return allowed[0] ?? null;
}

export function moved(
  widgets: readonly BoardWidget[],
  key: string,
  target: string | null,
): readonly BoardWidget[] {
  const from = widgets.findIndex((widget) => widget.key === key);
  const dragged = widgets[from];
  if (dragged === undefined || key === target) {
    return widgets;
  }
  const rest = widgets.filter((widget) => widget.key !== key);
  if (target === null) {
    return [...rest, dragged];
  }
  const to = widgets.findIndex((widget) => widget.key === target);
  const at = rest.findIndex((widget) => widget.key === target) + (from < to ? 1 : 0);
  return [...rest.slice(0, at), dragged, ...rest.slice(at)];
}

export function shifted(
  widgets: readonly BoardWidget[],
  visible: readonly string[],
  key: string,
  step: 1 | -1,
): readonly BoardWidget[] {
  const index = visible.indexOf(key);
  const neighbour = visible[index + step];
  if (index === -1 || neighbour === undefined) {
    return widgets;
  }
  return moved(widgets, key, neighbour);
}

export function resized(
  widgets: readonly BoardWidget[],
  key: string,
  size: WidgetSize,
): readonly BoardWidget[] {
  return widgets.map((widget) => (widget.key === key ? { ...widget, size } : widget));
}

export function removed(widgets: readonly BoardWidget[], key: string): readonly BoardWidget[] {
  return widgets.filter((widget) => widget.key !== key);
}

export function withOptions(
  widgets: readonly BoardWidget[],
  key: string,
  options: NonNullable<BoardWidget['options']>,
): readonly BoardWidget[] {
  return widgets.map((widget) => (widget.key === key ? { ...widget, options } : widget));
}

function freshKey(type: string, taken: ReadonlySet<string>): string {
  if (!taken.has(type)) {
    return type;
  }
  for (let n = 2; ; n += 1) {
    const key = `${type}:${String(n)}`;
    if (!taken.has(key)) {
      return key;
    }
  }
}

export function added(
  widgets: readonly BoardWidget[],
  type: string,
  size: WidgetSize,
  options?: NonNullable<BoardWidget['options']>,
): readonly BoardWidget[] {
  const key = freshKey(type, new Set(widgets.map((widget) => widget.key)));
  return [...widgets, options === undefined ? { key, type, size } : { key, type, size, options }];
}

export type InstanceCheck = (widget: BoardWidget) => boolean;

export interface Availability {
  readonly types: ReadonlySet<string>;
  readonly instance: InstanceCheck | undefined;
}

export function isShown(widget: BoardWidget, availability: Availability): boolean {
  if (!availability.types.has(widget.type)) {
    return false;
  }
  return availability.instance === undefined || availability.instance(widget);
}

function offerable(
  definition: WidgetDefinition,
  board: BoardClass,
  availability: Availability,
): boolean {
  const size = placeableSize(definition, board);
  return (
    size !== null && isShown({ key: definition.type, type: definition.type, size }, availability)
  );
}

export function addable(
  catalogue: readonly WidgetDefinition[],
  availability: Availability,
  board: BoardClass,
): readonly WidgetDefinition[] {
  return catalogue.filter((definition) => offerable(definition, board, availability));
}
