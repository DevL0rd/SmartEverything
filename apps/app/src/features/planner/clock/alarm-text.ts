import {
  minuteOfClock,
  type PlannerAlarmRow,
  type PlannerMissedReason,
  type PlannerRingRow,
  type PlannerWatchLink,
  type PlannerWatchState,
} from '@smarteverything/domain';
import type { StatusTone, Tone } from '../../../components/tone';
import { zonedDateFormat } from '../../../format/locale';
import { compareText } from '../../../format/text';
import {
  clock,
  clockOfMinutes,
  DAY_MS,
  daysBetween,
  HOUR_MS,
  localDayKey,
  MINUTE_MS,
  shiftDay,
  zonedInstant,
} from '../../../format/time';

export type AlarmTiming = Pick<
  PlannerAlarmRow,
  'time' | 'days' | 'once_on' | 'skip_on' | 'enabled'
>;

export interface NextRing {
  readonly alarm: PlannerAlarmRow;
  readonly at: number;
}

export interface WatchLine {
  readonly text: string;
  readonly tone: Tone;
}

const WEEKDAY_LONG = zonedDateFormat({ weekday: 'long' });
const WEEKDAY_SHORT = zonedDateFormat({ weekday: 'short' });
const WEEKDAY_NARROW = zonedDateFormat({ weekday: 'narrow' });
const MONTH_SHORT = zonedDateFormat({ month: 'short' });
const KEY_ZONE = 'UTC';
const HOUR_MINUTES = HOUR_MS / MINUTE_MS;
const DAY_MINUTES = DAY_MS / MINUTE_MS;
const SUNDAY = '2026-11-01';
const WEEK = 7;
const WEEKDAYS = [1, 2, 3, 4, 5] as const;
const WEEKEND = [0, 6] as const;

const WATCH_TONE: Readonly<Record<PlannerWatchState, Tone>> = {
  synced: 'positive',
  pending: 'warning',
  failed: 'critical',
  not_on_watch: 'faint',
};

function noonOf(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}

export function weekdayOfKey(date: string): number {
  return noonOf(date).getUTCDay();
}

function keyOfWeekday(day: number): string {
  return shiftDay(SUNDAY, day);
}

export function weekdayLetterOf(day: number): string {
  return WEEKDAY_NARROW(KEY_ZONE).format(noonOf(keyOfWeekday(day)));
}

export function weekdayNameOf(day: number): string {
  return WEEKDAY_LONG(KEY_ZONE).format(noonOf(keyOfWeekday(day)));
}

function weekdayShortOf(day: number): string {
  return WEEKDAY_SHORT(KEY_ZONE).format(noonOf(keyOfWeekday(day)));
}

export function weekOrderOf(weekStart: number): readonly number[] {
  return Array.from({ length: WEEK }, (_, index) => (weekStart + index) % WEEK);
}

export function dateTextOf(date: string): string {
  const at = noonOf(date);
  return `${WEEKDAY_LONG(KEY_ZONE).format(at)} ${String(at.getUTCDate())} ${MONTH_SHORT(KEY_ZONE).format(at)}`;
}

export function alarmLabelOf(alarm: Pick<PlannerAlarmRow, 'label'>): string {
  return alarm.label ?? 'Alarm';
}

function ringsOnDate(alarm: AlarmTiming, date: string): boolean {
  if (date === alarm.skip_on) return false;
  return alarm.days.length === 0 || alarm.days.includes(weekdayOfKey(date));
}

export function nextRingOf(alarm: AlarmTiming, now: number, timeZone: string): number | null {
  if (!alarm.enabled) return null;
  const minute = minuteOfClock(alarm.time);
  if (alarm.once_on !== null) {
    const once = zonedInstant(alarm.once_on, minute, timeZone);
    return alarm.skip_on === alarm.once_on || once <= now ? null : once;
  }
  let date = localDayKey(now, timeZone);
  for (;;) {
    const candidate = zonedInstant(date, minute, timeZone);
    if (ringsOnDate(alarm, date) && candidate > now) return candidate;
    date = shiftDay(date, 1);
  }
}

function hoursText(hours: number, minutes: number): string {
  if (hours === 0) return `${String(minutes)} min`;
  return minutes === 0 ? `${String(hours)} h` : `${String(hours)} h ${String(minutes)} min`;
}

export function countdownOf(at: number, now: number): string {
  const total = Math.max(1, Math.ceil((at - now) / MINUTE_MS));
  const days = Math.floor(total / DAY_MINUTES);
  const hours = Math.floor((total % DAY_MINUTES) / HOUR_MINUTES);
  const minutes = total % HOUR_MINUTES;
  if (days === 0) return hoursText(hours, minutes);
  if (days > 1) return `${String(days)} days`;
  return hours === 0 ? '1 day' : `1 day ${String(hours)} h`;
}

export function dayWordOf(at: number, now: number, timeZone: string): string {
  const day = localDayKey(at, timeZone);
  const ahead = daysBetween(localDayKey(now, timeZone), day);
  if (ahead <= 0) return 'Today';
  if (ahead === 1) return 'Tomorrow';
  return ahead < WEEK ? WEEKDAY_LONG(KEY_ZONE).format(noonOf(day)) : dateTextOf(day);
}

function sameDays(days: readonly number[], set: readonly number[]): boolean {
  return days.length === set.length && set.every((day) => days.includes(day));
}

export function repeatTextOf(alarm: AlarmTiming, weekStart: number): string {
  if (alarm.once_on !== null) return `${dateTextOf(alarm.once_on)}, once`;
  if (alarm.days.length === 0) return 'Once';
  if (alarm.days.length === WEEK) return 'Every day';
  if (sameDays(alarm.days, WEEKDAYS)) return 'Weekdays';
  if (sameDays(alarm.days, WEEKEND)) return 'Weekends';
  return weekOrderOf(weekStart)
    .filter((day) => alarm.days.includes(day))
    .map(weekdayShortOf)
    .join(', ');
}

export function nextRingTextOf(alarm: AlarmTiming, now: number, timeZone: string): string {
  if (!alarm.enabled) return 'Off';
  const at = nextRingOf(alarm, now, timeZone);
  if (at === null) return 'No next ring';
  return `${dayWordOf(at, now, timeZone)}, in ${countdownOf(at, now)}`;
}

export function skipDayOf(alarm: AlarmTiming, now: number, timeZone: string): string | null {
  if (alarm.once_on !== null || alarm.days.length === 0) return null;
  const at = nextRingOf({ ...alarm, skip_on: null }, now, timeZone);
  if (at === null) return null;
  return weekdayNameOf(weekdayOfKey(localDayKey(at, timeZone)));
}

export function soonestAlarmOf(
  alarms: readonly PlannerAlarmRow[],
  now: number,
  timeZone: string,
): NextRing | null {
  return alarms.reduce<NextRing | null>((best, alarm) => {
    const at = nextRingOf(alarm, now, timeZone);
    return at === null || (best !== null && best.at <= at) ? best : { alarm, at };
  }, null);
}

export function alarmsSubtitleOf(
  alarms: readonly PlannerAlarmRow[],
  now: number,
  timeZone: string,
): string | null {
  if (alarms.length === 0) return null;
  const soonest = soonestAlarmOf(alarms, now, timeZone);
  if (soonest === null) return 'No alarms on';
  const on = alarms.filter((alarm) => alarm.enabled).length;
  const when = `${dayWordOf(soonest.at, now, timeZone)}, in ${countdownOf(soonest.at, now)}`;
  return `Next alarm ${soonest.alarm.time} · ${when} · ${String(on)} on`;
}

function orderKeyOf(alarm: PlannerAlarmRow, now: number, timeZone: string): number {
  return nextRingOf(alarm, now, timeZone) ?? Number.POSITIVE_INFINITY;
}

export function alarmsInRingOrder(
  alarms: readonly PlannerAlarmRow[],
  now: number,
  timeZone: string,
): readonly PlannerAlarmRow[] {
  const keyed = alarms.map((alarm) => ({ alarm, at: orderKeyOf(alarm, now, timeZone) }));
  keyed.sort(
    (left, right) =>
      left.at - right.at ||
      minuteOfClock(left.alarm.time) - minuteOfClock(right.alarm.time) ||
      compareText(left.alarm.id, right.alarm.id),
  );
  return keyed.map((entry) => entry.alarm);
}

export function wakeRoutineTimeOf(alarm: PlannerAlarmRow): string | null {
  if (alarm.wake_lead_minutes === null) return null;
  return clockOfMinutes(minuteOfClock(alarm.time) - alarm.wake_lead_minutes);
}

function withDetail(title: string, detail: string | null): string {
  return detail === null ? title : `${title}. ${detail}`;
}

export function watchLineOf(link: PlannerWatchLink, watch: string): WatchLine {
  const tone = WATCH_TONE[link.state];
  switch (link.state) {
    case 'synced':
      return { text: `${watch} · synced`, tone };
    case 'pending':
      return { text: withDetail(`${watch} · waiting for the phone`, link.detail), tone };
    case 'failed':
      return { text: withDetail(`${watch} · not saved`, link.detail), tone };
    case 'not_on_watch':
      return { text: withDetail(`Not on ${watch}`, link.detail), tone };
  }
}

const MISSED_REASON: Readonly<Record<PlannerMissedReason, string>> = {
  hub_down: 'hub was off',
  phone_off: 'phone was off',
  computer_asleep: 'computer was asleep',
};

export function missedReasonOf(ring: Pick<PlannerRingRow, 'missed_reason'>): string {
  return ring.missed_reason === null ? 'did not ring' : MISSED_REASON[ring.missed_reason];
}

export function missedAlarmsOf(rings: readonly PlannerRingRow[]): readonly PlannerRingRow[] {
  return rings.filter((ring) => ring.kind === 'alarm' && ring.outcome === 'missed');
}

export function missedPillOf(dueAt: string, now: number, timeZone: string): string {
  const ago = daysBetween(localDayKey(dueAt, timeZone), localDayKey(now, timeZone));
  if (ago <= 0) return 'Missed today';
  if (ago === 1) return 'Missed yesterday';
  return `Missed ${WEEKDAY_LONG(timeZone).format(new Date(dueAt))}`;
}

export function missedStoryOf(
  ring: Pick<PlannerRingRow, 'missed_reason' | 'due_at'>,
  timeZone: string,
): string {
  const at = clock(ring.due_at, timeZone);
  const what =
    ring.missed_reason === null
      ? `It did not ring at ${at}.`
      : `The ${MISSED_REASON[ring.missed_reason]} at ${at}.`;
  return `${what} Clock doesn’t ring alarms late, so this one is marked missed.`;
}

const WATCH_DOT: Readonly<Record<PlannerWatchState, StatusTone | null>> = {
  synced: 'positive',
  pending: 'warning',
  failed: 'critical',
  not_on_watch: null,
};

export function watchDotOf(state: PlannerWatchState): StatusTone | null {
  return WATCH_DOT[state];
}
