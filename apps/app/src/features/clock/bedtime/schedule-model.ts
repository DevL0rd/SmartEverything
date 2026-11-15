import {
  minuteOfClock,
  type PlannerAlarmRow,
  type PlannerBedtime,
  type PlannerBedtimeNight,
} from '@smarteverything/domain';
import { clockOfMinutes, localDayKey, shiftDay, zonedInstant } from '../../../format/time';
import { countdownOf, weekdayOfKey, weekOrderOf } from '../../planner';
import { DAY_MINUTES, wrapMinute, type DialTimes } from './dial-model';

type Schedule = PlannerBedtime['schedule'];

const MINUTE_MS = 60_000;

const byNumber = (left: number, right: number): number => left - right;

const WEEK = 7;

const RUN_AT_LEAST = 3;

const SLEEP_GOAL_MINUTES = 8 * 60;

const FIRST_SUNDAY = Date.UTC(2026, 10, 15, 12);

const SHORT_DAY = new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' });

export const FALLBACK_NIGHT = { bed: '23:00', wake: '07:00' } as const;

export function dayShortOf(day: number): string {
  return SHORT_DAY.format(new Date(FIRST_SUNDAY + day * 86_400_000));
}

function runsOf(days: readonly number[], order: readonly number[]): number[][] {
  const runs: number[][] = [];
  let current: number[] = [];
  for (const day of order) {
    if (days.includes(day)) {
      current.push(day);
    } else if (current.length > 0) {
      runs.push(current);
      current = [];
    }
  }
  if (current.length > 0) runs.push(current);
  return runs;
}

export function daysTextOf(days: readonly number[], weekStart: number): string {
  if (days.length === WEEK) return 'Every night';
  if (days.length === 0) return 'No nights';
  return runsOf(days, weekOrderOf(weekStart))
    .map((run) => {
      const first = run[0] ?? 0;
      const last = run.at(-1) ?? first;
      return run.length >= RUN_AT_LEAST
        ? `${dayShortOf(first)} – ${dayShortOf(last)}`
        : run.map(dayShortOf).join(', ');
    })
    .join(', ');
}

function firstInWeek(night: PlannerBedtimeNight, order: readonly number[]): number {
  return Math.min(...night.days.map((day) => order.indexOf(day)));
}

export function nightsInOrder(schedule: Schedule, weekStart: number): Schedule {
  const order = weekOrderOf(weekStart);
  return [...schedule].sort((left, right) => firstInWeek(left, order) - firstInWeek(right, order));
}

export function freeDaysOf(schedule: Schedule): readonly number[] {
  const taken = new Set(schedule.flatMap((night) => night.days));
  return Array.from({ length: WEEK }, (_, day) => day).filter((day) => !taken.has(day));
}

function nightOf(days: readonly number[], times: DialTimes): PlannerBedtimeNight {
  return {
    days: [...days].sort(byNumber),
    bed: clockOfMinutes(times.bed),
    wake: clockOfMinutes(times.wake),
  };
}

export function withNightTimes(schedule: Schedule, index: number, times: DialTimes): Schedule {
  return schedule.map((night, at) => (at === index ? nightOf(night.days, times) : night));
}

export function toggledNightDay(schedule: Schedule, index: number, day: number): Schedule {
  const target = schedule[index];
  if (target === undefined) return schedule;
  const has = target.days.includes(day);
  return schedule.flatMap((night, at) => {
    const days =
      at === index
        ? has
          ? night.days.filter((one) => one !== day)
          : [...night.days, day]
        : night.days.filter((one) => has || one !== day);
    return days.length === 0 ? [] : [{ ...night, days: [...days].sort(byNumber) }];
  });
}

export function addedNight(
  schedule: Schedule,
  days: readonly number[],
  times: DialTimes,
): Schedule {
  if (days.length === 0) return schedule;
  const rest = schedule.flatMap((night) => {
    const kept = night.days.filter((day) => !days.includes(day));
    return kept.length === 0 ? [] : [{ ...night, days: kept }];
  });
  return [...rest, nightOf(days, times)];
}

export function removedNight(schedule: Schedule, index: number): Schedule {
  return schedule.filter((_, at) => at !== index);
}

export function crossesMidnight(night: Pick<PlannerBedtimeNight, 'bed' | 'wake'>): boolean {
  return minuteOfClock(night.wake) <= minuteOfClock(night.bed);
}

export function wakeDaysOf(night: PlannerBedtimeNight): readonly number[] {
  const shift = crossesMidnight(night) ? 1 : 0;
  return night.days.map((day) => (day + shift) % WEEK).sort(byNumber);
}

function sameDays(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((day) => right.includes(day));
}

export function wakeAlarmOf(
  alarms: readonly PlannerAlarmRow[],
  night: PlannerBedtimeNight,
): PlannerAlarmRow | null {
  const days = wakeDaysOf(night);
  return (
    alarms.find(
      (alarm) => alarm.once_on === null && alarm.time === night.wake && sameDays(alarm.days, days),
    ) ?? null
  );
}

export function wakeAlarmBodyOf(night: PlannerBedtimeNight): {
  readonly time: string;
  readonly days: readonly number[];
  readonly label: string;
} {
  return { time: night.wake, days: wakeDaysOf(night), label: 'Wake up' };
}

function firstNightOf(alarms: readonly PlannerAlarmRow[]): PlannerBedtimeNight {
  const alarm = alarms.find((row) => row.enabled && row.once_on === null && row.days.length > 0);
  if (alarm === undefined) {
    return { days: [0, 1, 2, 3, 4, 5, 6], ...FALLBACK_NIGHT };
  }
  const wake = minuteOfClock(alarm.time);
  const bed = wrapMinute(wake - SLEEP_GOAL_MINUTES);
  const shift = bed >= wake ? WEEK - 1 : 0;
  return {
    days: alarm.days.map((day) => (day + shift) % WEEK).sort(byNumber),
    bed: clockOfMinutes(bed),
    wake: alarm.time,
  };
}

export function startedBedtime(
  bedtime: PlannerBedtime,
  alarms: readonly PlannerAlarmRow[],
): PlannerBedtime {
  const schedule = bedtime.schedule.length > 0 ? bedtime.schedule : [firstNightOf(alarms)];
  return { ...bedtime, enabled: true, schedule };
}

export interface NextNight {
  readonly night: PlannerBedtimeNight;
  readonly windDownAt: number;
  readonly bedAt: number;
  readonly wakeAt: number;
}

function nightOn(bedtime: PlannerBedtime, date: string, zone: string): NextNight | null {
  const night = bedtime.schedule.find((entry) => entry.days.includes(weekdayOfKey(date)));
  if (night === undefined) return null;
  const bedAt = zonedInstant(date, minuteOfClock(night.bed), zone);
  const wakeDate = crossesMidnight(night) ? shiftDay(date, 1) : date;
  const wakeAt = zonedInstant(wakeDate, minuteOfClock(night.wake), zone);
  const lead = bedtime.wind_down_minutes ?? 0;
  return { night, bedAt, wakeAt, windDownAt: bedAt - lead * MINUTE_MS };
}

export function nextNightOf(bedtime: PlannerBedtime, now: number, zone: string): NextNight | null {
  if (!bedtime.enabled) return null;
  const today = localDayKey(now, zone);
  for (let offset = -1; offset <= WEEK; offset += 1) {
    const found = nightOn(bedtime, shiftDay(today, offset), zone);
    if (found !== null && found.wakeAt > now) return found;
  }
  return null;
}

export function tonightLineOf(next: NextNight | null, now: number): string {
  if (next === null) return 'No bedtime set';
  if (now >= next.bedAt) return `Sleep time · wake at ${next.night.wake}`;
  if (now >= next.windDownAt) return `Wind-down · bed at ${next.night.bed}`;
  return `Bedtime in ${countdownOf(next.bedAt, now)}`;
}

export function bedtimeSummaryOf(
  bedtime: PlannerBedtime,
  now: number,
  zone: string,
): string | null {
  const next = nextNightOf(bedtime, now, zone);
  if (next === null) return null;
  const day = localDayKey(next.bedAt, zone);
  const today = localDayKey(now, zone);
  if (now >= next.bedAt) return `Wake ${next.night.wake}`;
  if (day === today) return `Bed ${next.night.bed} tonight`;
  return `Bed ${next.night.bed} ${dayShortOf(weekdayOfKey(day))}`;
}

export const OFF = 'off';

const LEAD_CHOICES = [10, 15, 20, 30, 45, 60, 90, 120] as const;

export interface MinuteOption {
  readonly value: string;
  readonly label: string;
}

export function leadLabelOf(minutes: number): string {
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${String(hours)} ${hours === 1 ? 'hour' : 'hours'} before`;
  }
  return `${String(minutes)} min before`;
}

export function leadOptionsOf(current: number | null): readonly MinuteOption[] {
  const minutes = [...new Set([...LEAD_CHOICES, ...(current === null ? [] : [current])])].sort(
    (left, right) => left - right,
  );
  return [
    { value: OFF, label: 'Off' },
    ...minutes.map((value) => ({ value: String(value), label: leadLabelOf(value) })),
  ];
}

export function leadOf(value: string): number | null {
  return value === OFF ? null : Number(value);
}

export function scheduleMinutesOf(night: Pick<PlannerBedtimeNight, 'bed' | 'wake'>): number {
  const span = wrapMinute(minuteOfClock(night.wake) - minuteOfClock(night.bed));
  return span === 0 ? DAY_MINUTES : span;
}
