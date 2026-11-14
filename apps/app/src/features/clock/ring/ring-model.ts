import {
  weatherLabelOf,
  type PlannerAlarmRow,
  type PlannerColourKey,
  type PlannerDay,
  type PlannerItemRow,
  type PlannerOccurrenceView,
  type PlannerRingNotice,
  type PlannerRingRow,
  type PlannerTimerRow,
  type WeatherForecast,
} from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import { compareText, plural } from '../../../format/text';
import { clock, hourOf, longDate } from '../../../format/time';
import { ringPhaseOf } from '../../planner/data/ring';
import { degrees } from '../../weather/model/present';

const MORNING_ENDS_HOUR = 12;
const AFTERNOON_ENDS_HOUR = 18;

export type RingState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'unreachable' }
  | { readonly kind: 'missing' }
  | { readonly kind: 'stopped'; readonly ring: PlannerRingRow }
  | { readonly kind: 'snoozed'; readonly ring: PlannerRingRow; readonly until: string }
  | { readonly kind: 'ringing'; readonly ring: PlannerRingRow };

export interface RingLookup {
  readonly ringId: string;
  readonly due: string | null | undefined;
  readonly rows: readonly PlannerRingRow[] | undefined;
  readonly failed: boolean;
  readonly now: number;
}

export type RingSnooze =
  { readonly kind: 'alarm'; readonly minutes: number } | { readonly kind: 'timer' } | null;

export interface RingSubject {
  readonly label: string;
  readonly icon: IconName;
  readonly snooze: RingSnooze;
}

export interface RingRefs {
  readonly alarms: readonly PlannerAlarmRow[];
  readonly timers: readonly PlannerTimerRow[];
  readonly items: readonly PlannerItemRow[];
}

export interface TodayRow {
  readonly key: string;
  readonly time: string;
  readonly title: string;
  readonly colour: PlannerColourKey | null;
}

export function ringDueOf(
  ringId: string,
  incoming: PlannerRingNotice | null,
  dayRings: readonly PlannerRingRow[] | undefined,
): string | null | undefined {
  if (incoming?.ringId === ringId) return incoming.dueAt;
  if (dayRings === undefined) return undefined;
  return dayRings.find((ring) => ring.id === ringId)?.due_at ?? null;
}

export function ringStateOf({ ringId, due, rows, failed, now }: RingLookup): RingState {
  if (failed) return { kind: 'unreachable' };
  if (due === null) return { kind: 'missing' };
  if (due === undefined || rows === undefined) return { kind: 'loading' };
  const ring = rows.find((row) => row.id === ringId);
  if (ring === undefined) return { kind: 'missing' };
  const phase = ringPhaseOf(ring, now);
  if (phase.kind === 'snoozed') return { kind: 'snoozed', ring, until: phase.until };
  return { kind: phase.kind, ring };
}

function alarmSubjectOf(ring: PlannerRingRow, alarms: RingRefs['alarms']): RingSubject {
  const alarm = alarms.find((row) => row.id === ring.ref_id);
  if (alarm === undefined) return { label: 'Alarm', icon: 'alarmClock', snooze: null };
  return {
    label: alarm.label ?? 'Alarm',
    icon: 'alarmClock',
    snooze: { kind: 'alarm', minutes: alarm.snooze_minutes },
  };
}

function timerSubjectOf(ring: PlannerRingRow, timers: RingRefs['timers']): RingSubject {
  const timer = timers.find((row) => row.id === ring.ref_id);
  if (timer === undefined) return { label: 'Timer', icon: 'timer', snooze: null };
  return { label: timer.label ?? 'Timer', icon: 'timer', snooze: { kind: 'timer' } };
}

export function ringSubjectOf(ring: PlannerRingRow, refs: RingRefs): RingSubject {
  if (ring.kind === 'alarm') return alarmSubjectOf(ring, refs.alarms);
  if (ring.kind === 'timer') return timerSubjectOf(ring, refs.timers);
  const item = refs.items.find((row) => row.id === ring.ref_id);
  return { label: item?.title ?? 'Reminder', icon: 'bell', snooze: null };
}

export function snoozeLabelOf(snooze: Exclude<RingSnooze, null>): string {
  return snooze.kind === 'alarm' ? `Snooze ${String(snooze.minutes)} min` : 'Add 1 min';
}

export function greetingOf(hour: number): string {
  if (hour < MORNING_ENDS_HOUR) return 'Good morning';
  if (hour < AFTERNOON_ENDS_HOUR) return 'Good afternoon';
  return 'Good evening';
}

function startOf(view: PlannerOccurrenceView): string | null {
  return view.start ?? view.due_at;
}

function aheadOf(day: PlannerDay): readonly PlannerOccurrenceView[] {
  return [...day.current, ...day.upcoming].filter((view) => view.status === 'open');
}

function sortKeyOf(view: PlannerOccurrenceView): number {
  const start = startOf(view);
  return view.all_day || start === null ? Number.NEGATIVE_INFINITY : Date.parse(start);
}

function byStart(left: PlannerOccurrenceView, right: PlannerOccurrenceView): number {
  const a = sortKeyOf(left);
  const b = sortKeyOf(right);
  return a === b ? compareText(left.title, right.title) : a - b;
}

function firstBookedOf(day: PlannerDay, now: number): PlannerOccurrenceView | null {
  const timed = aheadOf(day).filter((view) => {
    const start = startOf(view);
    return !view.all_day && start !== null && Date.parse(start) >= now;
  });
  return [...timed].sort(byStart)[0] ?? null;
}

export function briefingLinesOf(day: PlannerDay, now: number): readonly string[] {
  const first = firstBookedOf(day, now);
  const start = first === null ? null : startOf(first);
  const lines = [
    first === null || start === null
      ? 'Nothing else is booked today.'
      : `First up at ${clock(start, day.time_zone)}: ${first.title}.`,
  ];
  const left = aheadOf(day).length;
  if (left > 0) lines.push(`${plural(left, 'thing')} left today.`);
  if (day.missed.length > 0) lines.push(`${String(day.missed.length)} missed earlier.`);
  return lines;
}

export function todayRowsOf(
  day: PlannerDay,
  colours: ReadonlyMap<string, PlannerColourKey>,
): readonly TodayRow[] {
  return [...aheadOf(day)].sort(byStart).map((view) => {
    const start = startOf(view);
    return {
      key: `${view.item_id}:${view.occurrence_key}`,
      time: view.all_day || start === null ? 'All day' : clock(start, day.time_zone),
      title: view.title,
      colour: colours.get(view.collection_id) ?? null,
    };
  });
}

export function weatherLineOf(forecast: WeatherForecast, today: string): string {
  const parts = [
    `${degrees(forecast.now.temperatureC)} ${weatherLabelOf(forecast.now.code).toLowerCase()}`,
  ];
  const sunrise = forecast.daily.find((day) => day.day === today)?.sunrise ?? null;
  if (sunrise !== null) parts.push(`sunrise ${clock(sunrise, forecast.timeZone)}`);
  return parts.join(' · ');
}

export function dateLineOf(now: number, weather: string | null): string {
  const date = longDate(new Date(now));
  return weather === null ? date : `${date} · ${weather}`;
}

export function greetingAt(now: number): string {
  return greetingOf(hourOf(new Date(now)));
}
