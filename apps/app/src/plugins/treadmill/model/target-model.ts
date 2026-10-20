import type { TreadmillLiveFrame } from '@smarteverything/domain';
import { ZONES, type ZoneKey } from '../../../features/fitness/model/heart';
import { count, decimal } from '../../../format/number';
import { clockText, distanceFigure } from './treadmill-model';

export const TARGET_KINDS = ['none', 'time', 'distance', 'steps', 'calories', 'climb'] as const;

export type TargetKind = (typeof TARGET_KINDS)[number];

export interface SessionTarget {
  readonly kind: TargetKind;
  readonly value: number;
  readonly zone: ZoneKey | null;
}

export const NO_TARGET: SessionTarget = { kind: 'none', value: 0, zone: null };

export interface TargetUnit {
  readonly unit: string;
  readonly factor: number;
  readonly step: number;
  readonly min: number;
  readonly max: number;
  readonly initial: number;
}

const UNITS: Readonly<Record<Exclude<TargetKind, 'none'>, TargetUnit>> = {
  time: { unit: 'min', factor: 60, step: 5, min: 5, max: 360, initial: 30 },
  distance: { unit: 'km', factor: 1000, step: 0.5, min: 0.5, max: 42, initial: 2 },
  steps: { unit: 'steps', factor: 1, step: 500, min: 500, max: 50_000, initial: 3000 },
  calories: { unit: 'kcal', factor: 1, step: 10, min: 10, max: 2000, initial: 100 },
  climb: { unit: 'm', factor: 1, step: 10, min: 10, max: 1000, initial: 50 },
};

export function targetUnit(kind: Exclude<TargetKind, 'none'>): TargetUnit {
  return UNITS[kind];
}

export const KIND_LABEL: Readonly<Record<TargetKind, string>> = {
  none: 'None',
  time: 'Time',
  distance: 'Distance',
  steps: 'Steps',
  calories: 'Energy',
  climb: 'Climb',
};

export interface TargetProgress {
  readonly done: number;
  readonly goal: number;
  readonly share: number;
  readonly label: string;
  readonly reached: boolean;
}

function doneOf(kind: Exclude<TargetKind, 'none'>, frame: TreadmillLiveFrame): number | null {
  const { belt, body, session } = frame;
  switch (kind) {
    case 'time':
      return belt.timeS;
    case 'distance':
      return belt.distanceM;
    case 'steps':
      return belt.steps;
    case 'calories':
      return body === null ? null : body.kcal;
    case 'climb':
      return session === null ? null : session.climbM;
  }
}

function labelOf(kind: Exclude<TargetKind, 'none'>, done: number, goal: number): string {
  switch (kind) {
    case 'time':
      return `${clockText(done)} of ${clockText(goal)}`;
    case 'distance':
      return `${distanceFigure(done).value} of ${distanceFigure(goal).value} km`;
    case 'steps':
      return `${count(done)} of ${count(goal)} steps`;
    case 'calories':
      return `${count(Math.round(done))} of ${count(goal)} kcal`;
    case 'climb':
      return `${decimal(done, 0)} of ${count(goal)} m climb`;
  }
}

export function targetProgress(
  target: SessionTarget,
  frame: TreadmillLiveFrame,
): TargetProgress | null {
  if (target.kind === 'none' || target.value <= 0) {
    return null;
  }
  const done = doneOf(target.kind, frame);
  if (done === null) {
    return null;
  }
  return {
    done,
    goal: target.value,
    share: Math.min(1, done / target.value),
    label: labelOf(target.kind, done, target.value),
    reached: done >= target.value,
  };
}

export function zoneBand(zone: ZoneKey, maxBpm: number): string {
  const index = ZONES.findIndex((entry) => entry.key === zone);
  const from = Math.round((ZONES[index]?.from ?? 0) * maxBpm);
  const upper = ZONES[index + 1];
  const label = ZONES[index]?.label ?? '';
  return upper === undefined
    ? `${label}, ${String(from)} bpm and up`
    : `${label}, ${String(from)} to ${String(Math.round(upper.from * maxBpm) - 1)} bpm`;
}
