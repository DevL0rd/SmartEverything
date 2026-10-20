import { BOTTLE_READING_ROW, type BottleReadingRow } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  canSave,
  currentLevel,
  progressLine,
  startCalibration,
  verdictOf,
  withPoint,
  withoutLastPoint,
} from './calibration-model';
import { NOW } from './fixtures';

const row = (overrides: Record<string, unknown> = {}): BottleReadingRow =>
  BOTTLE_READING_ROW.parse({
    at: new Date(NOW - 20_000).toISOString(),
    trigger: 'request',
    distanceMm: 88,
    kcps: 3000,
    ledOhm: 0,
    verdict: 'accepted',
    volumeMl: 400,
    kind: 'small',
    ml: null,
    drunkMl: null,
    ...overrides,
  });

describe('calibration flow', () => {
  it('starts at the first level and moves on after each point', () => {
    const start = startCalibration(680);
    expect(currentLevel(start)).toBe(55);
    const next = withPoint(start, 90);
    expect(next.points).toEqual([{ distanceMm: 90, ml: 55 }]);
    expect(currentLevel(next)).toBe(start.levels[1]);
  });

  it('can take a point back', () => {
    const state = withPoint(withPoint(startCalibration(680), 90), 85);
    expect(withoutLastPoint(state).points).toHaveLength(1);
    expect(withoutLastPoint(startCalibration(680)).points).toHaveLength(0);
  });

  it('may be saved from five points and ignores extra points past the last level', () => {
    let state = startCalibration(680);
    for (let index = 0; index < 4; index += 1) {
      state = withPoint(state, 100 - index);
    }
    expect(canSave(state)).toBe(false);
    state = withPoint(state, 80);
    expect(canSave(state)).toBe(true);
    for (let index = 0; index < 8; index += 1) {
      state = withPoint(state, 70);
    }
    expect(state.points).toHaveLength(11);
    expect(currentLevel(state)).toBeNull();
    expect(withPoint(state, 60)).toBe(state);
    expect(progressLine(state)).toBe('All levels measured.');
  });

  it('words the level being measured', () => {
    expect(progressLine(startCalibration(680))).toBe(
      'Level 1 of 11: pour in until the bottle holds 55 ml.',
    );
  });

  it('accepts a fresh accepted reading', () => {
    expect(verdictOf(row(), NOW)).toEqual({ kind: 'point', distanceMm: 88 });
  });

  it('asks again for a missing, old or skipped reading', () => {
    expect(verdictOf(undefined, NOW).kind).toBe('retry');
    expect(verdictOf(row({ at: new Date(NOW - 600_000).toISOString() }), NOW).kind).toBe('retry');
    const skipped = verdictOf(row({ verdict: 'slosh' }), NOW);
    expect(skipped.kind).toBe('retry');
  });
});
