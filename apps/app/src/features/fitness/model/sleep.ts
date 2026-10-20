import {
  appendTo,
  asleepMinutes,
  SLEEP_STAGE_KINDS,
  sleepSpansOf,
  type SleepStageKind,
} from '@smarteverything/domain';
import type { HypnogramSegment, HypnogramStage } from '../../../components/charts';
import { endOf, startOf, type RecordOf } from './records';
import { MINUTE_MS, dayKeyOf, minutesOfDay } from '../../../format/time';
import { compareText } from '../../../format/text';

export type StageKind = SleepStageKind;

export const STAGE_LABELS: Readonly<Record<StageKind, string>> = {
  awake: 'Awake',
  rem: 'REM',
  light: 'Light',
  deep: 'Deep',
  asleep: 'Asleep',
  unknown: 'Unknown',
};

export function stageKindOf(code: number): StageKind {
  return SLEEP_STAGE_KINDS[code] ?? 'unknown';
}

interface StageSpan {
  readonly kind: StageKind;
  readonly start: number;
  readonly end: number;
}

export interface SleepNight {
  readonly recordId: string;
  readonly day: string;
  readonly bedtime: number;
  readonly wake: number;
  readonly inBedMinutes: number;
  readonly asleepMinutes: number;
  readonly stages: readonly StageSpan[];
  readonly totals: Readonly<Record<StageKind, number>>;
  readonly hasStages: boolean;
  readonly efficiency: number | null;
  readonly source: string;
  readonly title: string | null;
}

type SleepRecord = RecordOf<'SleepSession'>;

function emptyTotals(): Record<StageKind, number> {
  return { awake: 0, rem: 0, light: 0, deep: 0, asleep: 0, unknown: 0 };
}

function spansOf(record: SleepRecord): StageSpan[] {
  const spans = sleepSpansOf(record);
  return spans.length > 0
    ? spans
    : [{ kind: 'asleep', start: startOf(record), end: endOf(record) }];
}

export function nightOf(record: SleepRecord): SleepNight {
  const stages = spansOf(record);
  const totals = emptyTotals();
  for (const span of stages) {
    totals[span.kind] += (span.end - span.start) / MINUTE_MS;
  }
  const inBed = (endOf(record) - startOf(record)) / MINUTE_MS;
  const hasStages = record.data.stages.length > 0;
  const asleep = asleepMinutes(record);
  return {
    recordId: record.recordId,
    day: dayKeyOf(endOf(record)),
    bedtime: startOf(record),
    wake: endOf(record),
    inBedMinutes: inBed,
    asleepMinutes: asleep,
    stages,
    totals,
    hasStages,
    efficiency: hasStages && inBed > 0 ? asleep / inBed : null,
    source: record.sourceApp,
    title: record.data.title,
  };
}

export interface SleepDay {
  readonly day: string;
  readonly main: SleepNight;
  readonly naps: readonly SleepNight[];
  readonly asleepMinutes: number;
}

export function sleepDaysOf(records: readonly SleepRecord[]): SleepDay[] {
  const byDay = new Map<string, SleepNight[]>();
  for (const night of records.map(nightOf)) {
    appendTo(byDay, night.day, night);
  }
  const days: SleepDay[] = [];
  for (const [day, nights] of byDay) {
    const sorted = [...nights].sort((left, right) => right.inBedMinutes - left.inBedMinutes);
    const [main, ...naps] = sorted;
    if (main !== undefined) {
      const asleepMinutes = sorted.reduce((sum, night) => sum + night.asleepMinutes, 0);
      days.push({ day, main, naps, asleepMinutes });
    }
  }
  return days.sort((left, right) => compareText(left.day, right.day));
}

export function eveningMinutes(moment: number): number {
  const minutes = minutesOfDay(moment);
  return minutes < 12 * 60 ? minutes + 24 * 60 : minutes;
}

class EmptySeriesError extends RangeError {
  override readonly name = 'EmptySeriesError';

  constructor(readonly operation: string) {
    super(`The ${operation} of an empty list of values is undefined.`);
  }
}

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const upper = sorted[Math.floor(sorted.length / 2)];
  const lower = sorted[Math.ceil(sorted.length / 2) - 1];
  if (upper === undefined || lower === undefined) {
    throw new EmptySeriesError('median');
  }
  return (lower + upper) / 2;
}

export function deviation(values: readonly number[]): number {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}

export interface SleepPattern {
  readonly nights: number;
  readonly averageAsleep: number;
  readonly usualBedtime: number;
  readonly usualWake: number;
  readonly bedtimeSpread: number;
  readonly wakeSpread: number;
  readonly regularity: number;
  readonly regularNights: number;
}

const REGULAR_WITHIN_MINUTES = 30;

export function patternOf(days: readonly SleepDay[]): SleepPattern | null {
  if (days.length === 0) {
    return null;
  }
  const marks = days.map((day) => ({
    bed: eveningMinutes(day.main.bedtime),
    wake: minutesOfDay(day.main.wake),
  }));
  const beds = marks.map((mark) => mark.bed);
  const wakes = marks.map((mark) => mark.wake);
  const usualBedtime = median(beds);
  const usualWake = median(wakes);
  const regular = marks.filter(
    (mark) =>
      Math.abs(mark.bed - usualBedtime) <= REGULAR_WITHIN_MINUTES &&
      Math.abs(mark.wake - usualWake) <= REGULAR_WITHIN_MINUTES,
  ).length;
  return {
    nights: days.length,
    averageAsleep: days.reduce((sum, day) => sum + day.asleepMinutes, 0) / days.length,
    usualBedtime: usualBedtime % (24 * 60),
    usualWake,
    bedtimeSpread: deviation(beds),
    wakeSpread: deviation(wakes),
    regularity: regular / days.length,
    regularNights: regular,
  };
}

const NAP_FROM_MINUTE = 10 * 60;
const NAP_TO_MINUTE = 20 * 60;
const NAP_LONGEST_MINUTES = 3 * 60;

export function isNap(night: SleepNight): boolean {
  const start = minutesOfDay(night.bedtime);
  return (
    start >= NAP_FROM_MINUTE && start < NAP_TO_MINUTE && night.inBedMinutes < NAP_LONGEST_MINUTES
  );
}

export interface DayNights {
  readonly night: SleepNight | null;
  readonly naps: readonly SleepNight[];
}

export function splitNights(nights: readonly SleepNight[], day: string): DayNights {
  const night =
    nights
      .filter((candidate) => !isNap(candidate))
      .sort((left, right) => right.asleepMinutes - left.asleepMinutes)[0] ?? null;
  const naps = nights
    .filter((candidate) => isNap(candidate) && candidate.day === day)
    .sort((left, right) => left.bedtime - right.bedtime);
  return { night, naps };
}

const HYPNOGRAM_STAGE: Readonly<Record<StageKind, HypnogramStage>> = {
  awake: 'awake',
  rem: 'rem',
  light: 'light',
  deep: 'deep',
  asleep: 'asleep',
  unknown: 'light',
};

export function timelineOf(night: SleepNight): readonly HypnogramSegment[] {
  return night.stages.map((span) => ({
    start: span.start,
    end: span.end,
    stage: HYPNOGRAM_STAGE[span.kind],
  }));
}
