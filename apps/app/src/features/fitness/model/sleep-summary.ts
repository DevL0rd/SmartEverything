import { summaryOf } from '../../../components/charts/hypnogram-model';
import { hoursMinutes } from '../../../format/time';
import type { Score } from './scores';
import { STAGE_LABELS, timelineOf, type SleepNight } from './sleep';

export type SummaryStage = 'deep' | 'light' | 'rem' | 'awake';

export interface TypicalRange {
  readonly low: number;
  readonly high: number;
  readonly caption: string;
}

export interface StageRow {
  readonly stage: SummaryStage;
  readonly label: string;
  readonly minutes: number;
  readonly share: number;
  readonly percent: number;
  readonly typical: TypicalRange;
  readonly within: boolean;
}

const ROW_ORDER: readonly SummaryStage[] = ['deep', 'light', 'rem', 'awake'];

const TYPICAL: Readonly<Record<SummaryStage, TypicalRange>> = {
  deep: { low: 13, high: 23, caption: 'Typical 13–23%' },
  light: { low: 50, high: 60, caption: 'Typical 50–60%' },
  rem: { low: 20, high: 25, caption: 'Typical 20–25%' },
  awake: { low: 0, high: 10, caption: 'Typical under 10%' },
};

export function stageRowsOf(night: SleepNight): readonly StageRow[] {
  if (!night.hasStages) {
    return [];
  }
  return ROW_ORDER.map((stage) => {
    const minutes = night.totals[stage];
    const base = stage === 'awake' ? night.inBedMinutes : night.asleepMinutes;
    const share = base > 0 ? minutes / base : 0;
    const percent = Math.round(share * 100);
    const typical = TYPICAL[stage];
    return {
      stage,
      label: STAGE_LABELS[stage],
      minutes,
      share,
      percent,
      typical,
      within: percent >= typical.low && percent <= typical.high,
    };
  });
}

export type ScoreWord = 'Great' | 'Good' | 'Fair' | 'Poor';

const GREAT_FROM = 85;
const GOOD_FROM = 70;
const FAIR_FROM = 50;

export function scoreWordOf(value: number): ScoreWord {
  if (value >= GREAT_FROM) {
    return 'Great';
  }
  if (value >= GOOD_FROM) {
    return 'Good';
  }
  return value >= FAIR_FROM ? 'Fair' : 'Poor';
}

export interface ScorePartRow {
  readonly key: string;
  readonly label: string;
  readonly fraction: number;
  readonly detail: string;
  readonly points: string;
}

export function trimWholeHours(text: string): string {
  return text.replace(/(\d)h 00m\b/g, '$1h');
}

function detailOf(night: SleepNight, key: string, explanation: string): string {
  if (key === 'duration') {
    return trimWholeHours(explanation);
  }
  if (key !== 'restorative' || night.asleepMinutes <= 0) {
    return explanation;
  }
  const share = (night.totals.deep + night.totals.rem) / night.asleepMinutes;
  return `${String(Math.round(share * 100))}% of sleep`;
}

export function scorePartRowsOf(night: SleepNight, score: Score): readonly ScorePartRow[] {
  return score.parts.map((part) => ({
    key: part.key,
    label: part.label,
    fraction: part.score / 100,
    detail: detailOf(night, part.key, part.explanation),
    points: `counts for ${String(part.weight)} points`,
  }));
}

export function nightSummaryOf(night: SleepNight): string {
  return summaryOf(timelineOf(night), 'Sleep stages');
}

export function asleepHeadline(night: SleepNight): string {
  return `${hoursMinutes(night.asleepMinutes)} asleep`;
}
