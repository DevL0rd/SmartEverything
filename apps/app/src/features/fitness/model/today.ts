import type { HealthMetric } from '@smarteverything/domain';
import type { ChartPoint } from '../../../components/charts';
import { baselineOf, figureOn, latestFigure } from './daily';
import type { EffectiveFitnessGoals } from './goals';
import { progressOf } from './goals';
import type { DailyFigure } from './points';
import { readiness, sleepScore, type Score } from './scores';
import type { SleepNight } from './sleep';
import { HOUR_MS, shiftDay, startOfDayKey } from '../../../format/time';

export interface RingValue {
  readonly key: 'move' | 'exercise' | 'steps';
  readonly label: string;
  readonly value: number | null;
  readonly goal: number;
  readonly progress: number;
  readonly unit: string;
}

interface RingSpec {
  readonly key: RingValue['key'];
  readonly label: string;
  readonly metric: HealthMetric;
  readonly goal: 'move_kcal' | 'active_minutes' | 'steps';
  readonly unit: string;
}

const RINGS: readonly RingSpec[] = [
  { key: 'move', label: 'Move', metric: 'active_energy', goal: 'move_kcal', unit: 'kcal' },
  { key: 'exercise', label: 'Exercise', metric: 'exercise', goal: 'active_minutes', unit: 'min' },
  { key: 'steps', label: 'Steps', metric: 'steps', goal: 'steps', unit: 'steps' },
];

export function ringsOf(
  figures: readonly DailyFigure[],
  day: string,
  goals: EffectiveFitnessGoals,
): readonly RingValue[] {
  return RINGS.map((ring) => {
    const value = figureOn(figures, day, ring.metric);
    const goal = goals[ring.goal];
    return {
      key: ring.key,
      label: ring.label,
      value,
      goal,
      progress: progressOf(value, goal),
      unit: ring.unit,
    };
  });
}

export interface DayReading {
  readonly day: string;
  readonly value: number;
}

export function latestReading(
  figures: readonly DailyFigure[],
  metric: HealthMetric,
  upTo: string,
): DayReading | null {
  const found = latestFigure(figures, metric, upTo);
  return found === null ? null : { day: found.day, value: found.value };
}

export function dailyPoints(
  figures: readonly DailyFigure[],
  metric: HealthMetric,
  upTo: string,
  days: number,
): readonly ChartPoint[] {
  const first = shiftDay(upTo, 1 - days);
  return figures
    .filter((figure) => figure.metric === metric && figure.day >= first && figure.day <= upTo)
    .map((figure) => ({ t: startOfDayKey(figure.day) + 12 * HOUR_MS, v: figure.value }))
    .sort((left, right) => left.t - right.t);
}

export interface HeartRange {
  readonly day: string;
  readonly low: number;
  readonly high: number;
}

export function heartRangeOf(figures: readonly DailyFigure[], upTo: string): HeartRange | null {
  const high = latestFigure(figures, 'heart_rate_maximum', upTo);
  if (high === null) {
    return null;
  }
  const low = figureOn(figures, high.day, 'heart_rate_minimum');
  return { day: high.day, low: low ?? high.value, high: high.value };
}

export interface ReadinessContext {
  readonly figures: readonly DailyFigure[];
  readonly day: string;
  readonly night: SleepNight | null;
  readonly sleepGoal: number;
}

export function readinessOf(context: ReadinessContext): Score | null {
  const { figures, day, night } = context;
  const yesterday = shiftDay(day, -1);
  return readiness({
    sleep: night === null ? null : sleepScore(night, context.sleepGoal),
    hrv: figureOn(figures, day, 'heart_rate_variability'),
    hrvBaseline: baselineOf(recent(figures, day), day, 'heart_rate_variability'),
    restingHeartRate: figureOn(figures, day, 'resting_heart_rate'),
    restingBaseline: baselineOf(recent(figures, day), day, 'resting_heart_rate'),
    load: figureOn(figures, yesterday, 'active_energy'),
    loadBaseline: baselineOf(recent(figures, yesterday), yesterday, 'active_energy'),
  });
}

const BASELINE_DAYS = 14;

function recent(figures: readonly DailyFigure[], day: string): readonly DailyFigure[] {
  const first = shiftDay(day, -BASELINE_DAYS);
  return figures.filter((figure) => figure.day >= first);
}

export function hasMetric(figures: readonly DailyFigure[], metric: HealthMetric): boolean {
  return figures.some((figure) => figure.metric === metric);
}
