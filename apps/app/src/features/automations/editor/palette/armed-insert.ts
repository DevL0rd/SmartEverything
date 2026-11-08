import type { PaletteChoice } from './palette-categories';
import { execOutHandle } from '../../model/graph/handle-ids';
import type { PinSource } from './pin-filter';

export interface InsertPoint {
  readonly pin: PinSource | null;
  readonly at: { readonly x: number; readonly y: number } | null;
  readonly filtered: boolean;
}

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export type InsertState =
  | { readonly phase: 'closed' }
  | {
      readonly phase: 'choosing';
      readonly point: InsertPoint;
      readonly anchor: ScreenPoint | null;
    };

export interface Insertion {
  readonly choice: PaletteChoice;
  readonly point: InsertPoint;
}

export interface InsertStep {
  readonly state: InsertState;
  readonly insertion: Insertion | null;
}

export const CLOSED: InsertState = { phase: 'closed' };

export const FREE_POINT: InsertPoint = { pin: null, at: null, filtered: false };

const stay = (state: InsertState): InsertStep => ({ state, insertion: null });

export function openPalette(point: InsertPoint, anchor: ScreenPoint | null): InsertStep {
  return stay({ phase: 'choosing', point, anchor });
}

export function openAtDrop(
  point: InsertPoint,
  anchor: ScreenPoint | null,
  fits: readonly PaletteChoice[],
): InsertStep {
  const [only, ...rest] = fits;
  if (only !== undefined && rest.length === 0) {
    return { state: CLOSED, insertion: { choice: only, point } };
  }
  return openPalette(point, anchor);
}

export function anchorOf(state: InsertState): ScreenPoint | null {
  return state.phase === 'choosing' ? state.anchor : null;
}

export function dockedOpen(state: InsertState): boolean {
  return state.phase === 'choosing' && state.anchor === null;
}

export function choose(state: InsertState, choice: PaletteChoice): InsertStep {
  if (state.phase !== 'choosing') return stay(state);
  return { state: CLOSED, insertion: { choice, point: state.point } };
}

export function cancel(state: InsertState): InsertStep {
  return stay(state.phase === 'closed' ? state : CLOSED);
}

export function paletteOpen(state: InsertState): boolean {
  return state.phase === 'choosing';
}

export function filterPinOf(state: InsertState): PinSource | null {
  return state.phase === 'choosing' && state.point.filtered ? state.point.pin : null;
}

export interface DropGhost {
  readonly nodeId: string;
  readonly handle: string;
  readonly side: 'in' | 'out';
  readonly x: number;
  readonly y: number;
}

function ghostEnd(pin: PinSource): Pick<DropGhost, 'handle' | 'side'> {
  switch (pin.kind) {
    case 'exec':
      return { handle: execOutHandle(pin.port), side: 'out' };
    case 'valueOut':
      return { handle: pin.handle, side: 'out' };
    case 'value':
    case 'execIn':
      return { handle: pin.handle, side: 'in' };
  }
}

export function dropGhostOf(state: InsertState): DropGhost | null {
  if (state.phase !== 'choosing' || state.point.at === null || state.point.pin === null)
    return null;
  const { pin } = state.point;
  return { nodeId: pin.nodeId, ...ghostEnd(pin), ...state.point.at };
}

export function insertPointText(state: InsertState): string | null {
  return filterPinOf(state) === null ? null : 'Adding at the spot you picked.';
}
