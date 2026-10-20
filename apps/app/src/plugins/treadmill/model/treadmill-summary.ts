import type { PadPreferences, TreadmillLiveFrame } from '@smarteverything/domain';
import { clockText, distanceFigure, speedText } from './treadmill-model';
import type { ChartPoint } from '../../../components/charts';

export interface GoalProgress {
  readonly kind: 'distance' | 'calories' | 'time';
  readonly done: number;
  readonly goal: number;
  readonly share: number;
  readonly label: string;
}

const KM = 1000;

export function speedSummary(points: readonly ChartPoint[], minutes: number): string {
  if (points.length === 0) {
    return `Speed, last ${String(minutes)} minutes, no data yet`;
  }
  const values = points.map((point) => point.v);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return `Speed, last ${String(minutes)} minutes, ${speedText(low)} to ${speedText(high)} km/h, average ${speedText(average)}`;
}

function shareOf(done: number, goal: number): number {
  return goal > 0 ? Math.min(1, done / goal) : 0;
}

export function goalProgress(
  pad: Pick<PadPreferences, 'goalKind' | 'goalValue'>,
  frame: TreadmillLiveFrame,
): GoalProgress | null {
  const { goalKind, goalValue } = pad;
  if (goalKind === undefined || goalKind === 'none' || goalValue === undefined || goalValue <= 0) {
    return null;
  }
  const { belt, body } = frame;
  if (goalKind === 'time') {
    return {
      kind: goalKind,
      done: belt.timeS,
      goal: goalValue,
      share: shareOf(belt.timeS, goalValue),
      label: `${clockText(belt.timeS)} of ${clockText(goalValue)}`,
    };
  }
  if (goalKind === 'distance') {
    const done = distanceFigure(belt.distanceM).value;
    return {
      kind: goalKind,
      done: belt.distanceM,
      goal: goalValue,
      share: shareOf(belt.distanceM, goalValue),
      label: `${done} of ${distanceFigure(goalValue).value} km`,
    };
  }
  if (body === null) {
    return null;
  }
  return {
    kind: 'calories',
    done: body.kcal,
    goal: goalValue,
    share: shareOf(body.kcal, goalValue),
    label: `${String(Math.round(body.kcal))} of ${String(goalValue)} kcal`,
  };
}

export interface GoalUnit {
  readonly unit: string;
  readonly factor: number;
  readonly step: number;
  readonly min: number;
  readonly max: number;
  readonly initial: number;
}

const GOAL_UNITS: Readonly<Record<'distance' | 'calories' | 'time', GoalUnit>> = {
  distance: { unit: 'km', factor: KM, step: 0.5, min: 0.5, max: 42, initial: 2 },
  calories: { unit: 'kcal', factor: 1, step: 10, min: 10, max: 2000, initial: 100 },
  time: { unit: 'min', factor: 60, step: 5, min: 5, max: 360, initial: 30 },
};

export function goalValueUnit(kind: 'distance' | 'calories' | 'time'): GoalUnit {
  return GOAL_UNITS[kind];
}
