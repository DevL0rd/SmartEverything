export interface BarShape {
  readonly count: number;
  readonly orb: boolean;
}

export const NO_SLOT = -1;

export const TAP_SLOP = 8;

export type HoldOutcome = 'drop' | 'menu' | 'cancel';

export function movedPastSlop(travel: number): boolean {
  'worklet';
  return Math.abs(travel) > TAP_SLOP;
}

export function holdOutcome(placed: boolean, moved: boolean): HoldOutcome {
  if (placed) return 'drop';
  return moved ? 'cancel' : 'menu';
}

function columnCount(shape: BarShape): number {
  'worklet';
  return shape.count + (shape.orb ? 1 : 0);
}

function orbColumn(shape: BarShape): number {
  'worklet';
  return Math.ceil(shape.count / 2);
}

export function columnOfSlot(slot: number, shape: BarShape): number {
  'worklet';
  return shape.orb && slot >= orbColumn(shape) ? slot + 1 : slot;
}

function slotOfColumn(column: number, shape: BarShape, rightward: boolean): number {
  'worklet';
  if (!shape.orb) return column;
  const orb = orbColumn(shape);
  if (column === orb) return rightward ? orb : orb - 1;
  return column > orb ? column - 1 : column;
}

export function targetSlot(from: number, dx: number, columnWidth: number, shape: BarShape): number {
  'worklet';
  if (columnWidth <= 0 || shape.count === 0) return from;
  const wanted = columnOfSlot(from, shape) + Math.round(dx / columnWidth);
  const column = Math.min(Math.max(wanted, 0), columnCount(shape) - 1);
  const slot = slotOfColumn(column, shape, dx > 0);
  return Math.min(Math.max(slot, 0), shape.count - 1);
}

const CENTRE_HALF = 0.2;

function heldSlot(from: number, direction: number, travel: number, shape: BarShape): number {
  'worklet';
  const columns = Math.round(travel);
  if (columns < 1 || Math.abs(travel - columns) > CENTRE_HALF) return NO_SLOT;
  const column = columnOfSlot(from, shape) + direction * columns;
  const free = column >= 0 && column < columnCount(shape);
  if (!free || (shape.orb && column === orbColumn(shape))) return NO_SLOT;
  const slot = slotOfColumn(column, shape, direction > 0);
  return slot === from ? NO_SLOT : slot;
}

export interface BarTarget {
  readonly to: number;
  readonly into: number;
}

export function barTarget(
  from: number,
  dx: number,
  columnWidth: number,
  shape: BarShape,
): BarTarget {
  'worklet';
  if (columnWidth <= 0 || shape.count === 0) return { to: from, into: NO_SLOT };
  const direction = dx < 0 ? -1 : 1;
  const travel = Math.abs(dx) / columnWidth;
  const swaps = Math.max(0, Math.floor(travel - CENTRE_HALF));
  const to = targetSlot(from, direction * swaps * columnWidth, columnWidth, shape);
  const into = heldSlot(from, direction, travel, shape);
  return into === NO_SLOT ? { to, into } : { to: into - direction, into };
}

export function shiftedSlot(slot: number, from: number, to: number): number {
  'worklet';
  if (slot === from) return to;
  if (from < to && slot > from && slot <= to) return slot - 1;
  if (from > to && slot >= to && slot < from) return slot + 1;
  return slot;
}

export interface BarGeometry {
  readonly columnWidth: number;
  readonly shape: BarShape;
}

export function shiftOffset(slot: number, from: number, to: number, bar: BarGeometry): number {
  'worklet';
  const shifted = shiftedSlot(slot, from, to);
  return (columnOfSlot(shifted, bar.shape) - columnOfSlot(slot, bar.shape)) * bar.columnWidth;
}

export function reorderedKeys(
  keys: readonly string[],
  from: number,
  to: number,
): readonly string[] {
  const moved = keys[from];
  if (moved === undefined || from === to) return keys;
  const rest = keys.filter((_key, index) => index !== from);
  return [...rest.slice(0, to), moved, ...rest.slice(to)];
}
