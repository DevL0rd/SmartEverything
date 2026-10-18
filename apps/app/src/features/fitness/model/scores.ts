import type { SleepNight } from './sleep';
import { hoursMinutes } from '../../../format/time';
import { count, kilocalories, percent, withUnit } from '../../../format/number';

interface ScorePart {
  readonly key: string;
  readonly label: string;
  readonly weight: number;
  readonly score: number;
  readonly explanation: string;
}

export interface Score {
  readonly value: number;
  readonly parts: readonly ScorePart[];
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function weighted(parts: readonly ScorePart[]): Score | null {
  const weight = parts.reduce((sum, part) => sum + part.weight, 0);
  if (weight === 0) {
    return null;
  }
  const value = parts.reduce((sum, part) => sum + part.weight * part.score, 0) / weight;
  return { value: Math.round(value), parts };
}

const DEEP_AND_REM_TARGET = 0.4;
const EFFICIENCY_TARGET = 0.9;

export function sleepScore(night: SleepNight, goalMinutes: number): Score | null {
  const parts: ScorePart[] = [
    {
      key: 'duration',
      label: 'Duration',
      weight: 50,
      score: clamp((night.asleepMinutes / goalMinutes) * 100, 0, 100),
      explanation: `${hoursMinutes(night.asleepMinutes)} of ${hoursMinutes(goalMinutes)}`,
    },
  ];
  if (night.hasStages && night.asleepMinutes > 0) {
    const restorative = (night.totals.deep + night.totals.rem) / night.asleepMinutes;
    parts.push({
      key: 'restorative',
      label: 'Deep and REM',
      weight: 25,
      score: clamp((restorative / DEEP_AND_REM_TARGET) * 100, 0, 100),
      explanation: `${String(Math.round(restorative * 100))}% deep and REM`,
    });
  }
  if (night.efficiency !== null) {
    parts.push({
      key: 'efficiency',
      label: 'Efficiency',
      weight: 25,
      score: clamp((night.efficiency / EFFICIENCY_TARGET) * 100, 0, 100),
      explanation: `${String(Math.round(night.efficiency * 100))}% of time in bed`,
    });
  }
  return weighted(parts);
}

export interface ReadinessInput {
  readonly sleep: Score | null;
  readonly hrv: number | null;
  readonly hrvBaseline: number | null;
  readonly restingHeartRate: number | null;
  readonly restingBaseline: number | null;
  readonly load: number | null;
  readonly loadBaseline: number | null;
}

const NEUTRAL_SCORE = 75;

const READINESS_MIN_INPUTS = 2;

function hrvPart(today: number, baseline: number): ScorePart {
  const change = today / baseline - 1;
  return {
    key: 'hrv',
    label: 'HRV',
    weight: 25,
    score: clamp(NEUTRAL_SCORE + change * 250, 0, 100),
    explanation: `${percent(Math.abs(change))} ${change >= 0 ? 'above' : 'below'} usual`,
  };
}

function restingPart(today: number, baseline: number): ScorePart {
  const change = today - baseline;
  return {
    key: 'resting',
    label: 'Resting heart rate',
    weight: 25,
    score: clamp(NEUTRAL_SCORE - change * 8, 0, 100),
    explanation: `${withUnit(count(today), 'bpm')}, usual ${count(baseline)}`,
  };
}

function loadPart(load: number, baseline: number): ScorePart {
  const ratio = baseline > 0 ? load / baseline : 1;
  return {
    key: 'load',
    label: 'Yesterday’s effort',
    weight: 15,
    score: clamp(100 - Math.max(0, ratio - 1) * 100, 0, 100),
    explanation: `${kilocalories(load)}, usual ${count(baseline)}`,
  };
}

function sleepPart(sleep: Score): ScorePart {
  return {
    key: 'sleep',
    label: 'Last night’s sleep',
    weight: 35,
    score: sleep.value,
    explanation: `Score ${String(sleep.value)}`,
  };
}

function bodyParts(input: ReadinessInput): ScorePart[] {
  const parts: ScorePart[] = [];
  if (input.hrv !== null && input.hrvBaseline !== null && input.hrvBaseline > 0) {
    parts.push(hrvPart(input.hrv, input.hrvBaseline));
  }
  if (input.restingHeartRate !== null && input.restingBaseline !== null) {
    parts.push(restingPart(input.restingHeartRate, input.restingBaseline));
  }
  if (input.load !== null && input.loadBaseline !== null) {
    parts.push(loadPart(input.load, input.loadBaseline));
  }
  return parts;
}

export function readiness(input: ReadinessInput): Score | null {
  const parts = [...(input.sleep === null ? [] : [sleepPart(input.sleep)]), ...bodyParts(input)];
  const anchored = parts.some((part) => part.key === 'sleep' || part.key === 'hrv');
  return parts.length >= READINESS_MIN_INPUTS && anchored ? weighted(parts) : null;
}

export function readinessWord(score: number): string {
  if (score >= 80) {
    return 'Ready';
  }
  return score >= 60 ? 'Steady' : 'Take it easy';
}
