import { MODEL_SIGNAL_SET, type DeviceFamily } from '@smarteverything/domain';
import { expect } from 'vitest';
import type { VisualState } from '../types';
import { signalsOf, type ModelSignals } from './signals-of';

export const BASE: VisualState = {
  power: 'on',
  online: true,
  level: 0.6,
  band: null,
  target: null,
  targetShare: null,
  current: null,
  oscillating: false,
  angle: null,
  colour: null,
  ambientLight: null,
  waterLow: false,
  waterLevel: null,
  thermal: 'idle',
  locked: null,
  position: null,
  progress: null,
  battery: null,
  pulse: null,
  syncing: false,
  load: null,
  reading: null,
  source: null,
  presence: null,
  open: null,
};

export const ON = { power: true, online: true } as const;

export function sample(changes: Partial<VisualState>): VisualState {
  return { ...BASE, ...changes };
}

export function expectSignals(
  family: DeviceFamily,
  state: VisualState,
  expected: ModelSignals,
): void {
  const actual = signalsOf(family, state);
  expect(actual).toEqual(expected);
  expect(MODEL_SIGNAL_SET.safeParse(actual).success).toBe(true);
}
