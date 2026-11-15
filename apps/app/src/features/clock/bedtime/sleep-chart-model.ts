import {
  minuteOfClock,
  type PlannerBedtime,
  type PlannerBedtimeNight,
  type PlannerSleep,
  type PlannerSleepNight,
} from '@smarteverything/domain';
import type { WindowColumn } from '../../../components/charts';
import { clock24, shiftDay, zonedInstant } from '../../../format/time';
import { weekdayOfKey } from '../../planner';
import { sleepLengthText } from './dial-model';
import { crossesMidnight } from './schedule-model';

export type SleepSpan = 'week' | 'month';

const SPAN_NIGHTS: Readonly<Record<SleepSpan, number>> = { week: 7, month: 30 };

const NOON = 12 * 60;

const DAY_MINUTES = 24 * 60;

export interface PlannedNight {
  readonly bed: number;
  readonly wake: number;
}

export interface SleepColumn extends WindowColumn {
  readonly date: string;
  readonly planned: PlannedNight | null;
}

export interface SleepWindow {
  readonly from: string;
  readonly to: string;
}

export interface SleepFacts {
  readonly recorded: number;
  readonly total: number;
  readonly averageAsleep: number | null;
  readonly weekAverage: number | null;
  readonly bedDrift: number | null;
  readonly wakeDrift: number | null;
}

export function sleepDatesOf(span: SleepSpan, today: string): readonly string[] {
  const count = SPAN_NIGHTS[span];
  return Array.from({ length: count }, (_, index) => shiftDay(today, index - count + 1));
}

export function sleepWindowOf(span: SleepSpan, today: string, zone: string): SleepWindow {
  const first = sleepDatesOf(span, today)[0] ?? today;
  return {
    from: new Date(zonedInstant(shiftDay(first, -1), NOON, zone)).toISOString(),
    to: new Date(zonedInstant(shiftDay(today, 1), 0, zone)).toISOString(),
  };
}

function planOf(night: PlannerBedtimeNight): PlannedNight {
  return { bed: minuteOfClock(night.bed), wake: minuteOfClock(night.wake) };
}

export function plannedNightOf(bedtime: PlannerBedtime, wakeDate: string): PlannedNight | null {
  if (!bedtime.enabled) return null;
  const before = weekdayOfKey(shiftDay(wakeDate, -1));
  const same = weekdayOfKey(wakeDate);
  const overnight = bedtime.schedule.find(
    (night) => night.days.includes(before) && crossesMidnight(night),
  );
  if (overnight !== undefined) return planOf(overnight);
  const daytime = bedtime.schedule.find(
    (night) => night.days.includes(same) && !crossesMidnight(night),
  );
  return daytime === undefined ? null : planOf(daytime);
}

function minuteIn(moment: string, zone: string): number {
  return minuteOfClock(clock24(moment, zone));
}

function columnOf(
  date: string,
  night: PlannerSleepNight | undefined,
  planned: PlannedNight | null,
  zone: string,
): SleepColumn {
  return {
    key: date,
    date,
    at: zonedInstant(date, NOON, zone),
    planned,
    nap: null,
    night:
      night === undefined
        ? null
        : {
            bed: minuteIn(night.bed_at, zone),
            wake: minuteIn(night.woke_at, zone),
            asleepMinutes: night.asleep_minutes,
          },
  };
}

export function sleepColumnsOf(input: {
  readonly sleep: PlannerSleep;
  readonly bedtime: PlannerBedtime;
  readonly span: SleepSpan;
  readonly today: string;
  readonly zone: string;
}): readonly SleepColumn[] {
  const byDate = new Map(input.sleep.nights.map((night) => [night.date, night]));
  return sleepDatesOf(input.span, input.today).map((date) =>
    columnOf(date, byDate.get(date), plannedNightOf(input.bedtime, date), input.zone),
  );
}

function evening(minute: number): number {
  return minute < NOON ? minute + DAY_MINUTES : minute;
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function drifts(
  columns: readonly SleepColumn[],
  pick: (night: PlannedNight) => number,
): readonly number[] {
  return columns.flatMap((column) =>
    column.night === null || column.planned === null
      ? []
      : [evening(pick(column.night)) - evening(pick(column.planned))],
  );
}

export function sleepFactsOf(sleep: PlannerSleep, columns: readonly SleepColumn[]): SleepFacts {
  const recorded = columns.flatMap((column) => (column.night === null ? [] : [column.night]));
  return {
    recorded: recorded.length,
    total: columns.length,
    averageAsleep: average(recorded.map((night) => night.asleepMinutes)),
    weekAverage: sleep.week_average_minutes,
    bedDrift: average(drifts(columns, (night) => night.bed)),
    wakeDrift: average(drifts(columns, (night) => night.wake)),
  };
}

export function driftTextOf(minutes: number | null): string {
  if (minutes === null) return 'No plan to compare';
  if (minutes === 0) return 'On plan';
  const direction = minutes > 0 ? 'later' : 'earlier';
  return `${sleepLengthText(Math.abs(minutes))} ${direction}`;
}

function bedClauseOf(drift: number | null): string {
  if (drift === null) return '';
  if (drift === 0) return ', in bed on plan';
  return `, in bed ${driftTextOf(drift).toLowerCase()} than planned`;
}

export function sleepSummaryOf(facts: SleepFacts, span: SleepSpan): string {
  if (facts.recorded === 0) return `No sleep recorded this ${span}.`;
  const average =
    facts.averageAsleep === null
      ? ''
      : `, ${sleepLengthText(facts.averageAsleep)} asleep on average`;
  const bed = bedClauseOf(facts.bedDrift);
  return `${String(facts.recorded)} of ${String(facts.total)} nights recorded${average}${bed}.`;
}
