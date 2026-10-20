import type { BottleCalibrationPoint, BottleReadingRow } from '@smarteverything/domain';
import { MINUTE_MS } from '../../../format/time';
import { calibrationLevels } from './settings-model';

export const MIN_POINTS = 5;

const FRESH_READING_MS = 2 * MINUTE_MS;

export interface CalibrationState {
  readonly levels: readonly number[];
  readonly points: readonly BottleCalibrationPoint[];
}

export function startCalibration(body: number): CalibrationState {
  return { levels: calibrationLevels(body), points: [] };
}

export function currentLevel(state: CalibrationState): number | null {
  return state.levels[state.points.length] ?? null;
}

export function canSave(state: CalibrationState): boolean {
  return state.points.length >= MIN_POINTS;
}

type ReadingVerdict =
  | { readonly kind: 'point'; readonly distanceMm: number }
  | { readonly kind: 'retry'; readonly reason: string };

export function verdictOf(row: BottleReadingRow | undefined, now: number): ReadingVerdict {
  if (row === undefined || now - Date.parse(row.at) > FRESH_READING_MS) {
    return { kind: 'retry', reason: 'No new reading came back. Tap the cap and try again.' };
  }
  if (row.verdict !== 'accepted') {
    return {
      kind: 'retry',
      reason: 'That reading was skipped. Hold the bottle upright and still, then try again.',
    };
  }
  return { kind: 'point', distanceMm: row.distanceMm };
}

export function withPoint(state: CalibrationState, distanceMm: number): CalibrationState {
  const ml = currentLevel(state);
  return ml === null ? state : { ...state, points: [...state.points, { distanceMm, ml }] };
}

export function withoutLastPoint(state: CalibrationState): CalibrationState {
  return { ...state, points: state.points.slice(0, -1) };
}

export function progressLine(state: CalibrationState): string {
  const level = currentLevel(state);
  return level === null
    ? 'All levels measured.'
    : `Level ${String(state.points.length + 1)} of ${String(state.levels.length)}: pour in until the bottle holds ${String(level)} ml.`;
}
