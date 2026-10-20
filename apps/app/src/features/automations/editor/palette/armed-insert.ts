import type { InsertPoint } from '../../model/canvas/contract';
import type { PaletteChoice } from './palette-categories';

export type InsertState =
  | { readonly phase: 'closed' }
  | { readonly phase: 'choosing'; readonly point: InsertPoint | null }
  | { readonly phase: 'placing'; readonly choice: PaletteChoice };

export interface Insertion {
  readonly choice: PaletteChoice;
  readonly point: InsertPoint;
}

export interface InsertStep {
  readonly state: InsertState;
  readonly insertion: Insertion | null;
}

export const CLOSED: InsertState = { phase: 'closed' };

const stay = (state: InsertState): InsertStep => ({ state, insertion: null });

export function openPalette(point: InsertPoint | null): InsertStep {
  return stay({ phase: 'choosing', point });
}

export function choose(state: InsertState, choice: PaletteChoice): InsertStep {
  if (state.phase !== 'choosing') return stay(state);
  if (state.point === null) return stay({ phase: 'placing', choice });
  return { state: CLOSED, insertion: { choice, point: state.point } };
}

export function placeAt(state: InsertState, point: InsertPoint): InsertStep {
  if (state.phase !== 'placing') return stay(state);
  return { state: CLOSED, insertion: { choice: state.choice, point } };
}

export function cancel(state: InsertState): InsertStep {
  return stay(state.phase === 'closed' ? state : CLOSED);
}

export function highlightsAllPoints(state: InsertState): boolean {
  return state.phase === 'placing';
}

export function paletteOpen(state: InsertState): boolean {
  return state.phase === 'choosing';
}

export function armedPointId(state: InsertState): string | null {
  return state.phase === 'choosing' ? (state.point?.id ?? null) : null;
}

export function insertPointText(state: InsertState): string | null {
  if (state.phase === 'placing') return 'Tap a highlighted spot to place it.';
  if (state.phase === 'choosing' && state.point !== null) return 'Adding at the spot you picked.';
  return null;
}
