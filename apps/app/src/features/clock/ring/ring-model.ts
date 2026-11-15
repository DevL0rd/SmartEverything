import {
  weatherLabelOf,
  type PlannerAlarmRow,
  type PlannerAlarmSound,
  type PlannerChallenge,
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
import { ringPhaseOf } from '../../planner';
import { degrees } from '../../weather';
import type { PhoneRingKind } from './ring-keys';

const MORNING_ENDS_HOUR = 12;
const AFTERNOON_ENDS_HOUR = 18;

export type RingState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'unreachable' }
  | { readonly kind: 'missing' }
  | { readonly kind: 'stopped'; readonly ring: PlannerRingRow }
  | { readonly kind: 'snoozed'; readonly ring: PlannerRingRow; readonly until: string }
  | { readonly kind: 'ringing'; readonly ring: PlannerRingRow }
  | { readonly kind: 'local'; readonly local: LocalRing };

export interface LocalRing {
  readonly key: string;
  readonly kind: PhoneRingKind;
  readonly refId: string;
}

export interface RingLookup {
  readonly ringId: string | null | undefined;
  readonly due: string | null | undefined;
  readonly rows: readonly PlannerRingRow[] | undefined;
  readonly failed: boolean;
  readonly now: number;
  readonly local: LocalRing | null;
}

export type RingSubjectRef = Pick<PlannerRingRow, 'kind' | 'ref_id'>;

export type RingSnooze =
  { readonly kind: 'alarm'; readonly minutes: number } | { readonly kind: 'timer' } | null;

export interface RingSubject {
  readonly label: string;
  readonly icon: IconName;
  readonly snooze: RingSnooze;
  readonly limit: number | null;
  readonly challenge: PlannerChallenge;
  readonly sound: PlannerAlarmSound | null;
}

const NO_CHALLENGE: PlannerChallenge = { kind: 'none' };

const PLAIN = { limit: null, challenge: NO_CHALLENGE, sound: null } as const;

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

function hubStateOf({ ringId, due, rows, failed, now }: RingLookup): RingState {
  if (failed) return { kind: 'unreachable' };
  if (ringId === null || due === null) return { kind: 'missing' };
  if (ringId === undefined || due === undefined || rows === undefined) return { kind: 'loading' };
  const ring = rows.find((row) => row.id === ringId);
  if (ring === undefined) return { kind: 'missing' };
  const phase = ringPhaseOf(ring, now);
  if (phase.kind === 'snoozed') return { kind: 'snoozed', ring, until: phase.until };
  return { kind: phase.kind, ring };
}

export function ringStateOf(lookup: RingLookup): RingState {
  const hub = hubStateOf(lookup);
  if (lookup.local === null || hub.kind === 'ringing' || hub.kind === 'snoozed') return hub;
  return { kind: 'local', local: lookup.local };
}

function alarmSubjectOf(ref: RingSubjectRef, alarms: RingRefs['alarms']): RingSubject {
  const alarm = alarms.find((row) => row.id === ref.ref_id);
  if (alarm === undefined) return { label: 'Alarm', icon: 'alarmClock', snooze: null, ...PLAIN };
  return {
    label: alarm.label ?? 'Alarm',
    icon: 'alarmClock',
    snooze: { kind: 'alarm', minutes: alarm.snooze_minutes },
    limit: alarm.snooze_limit,
    challenge: alarm.challenge,
    sound: alarm.sound,
  };
}

function timerSubjectOf(ref: RingSubjectRef, timers: RingRefs['timers']): RingSubject {
  const timer = timers.find((row) => row.id === ref.ref_id);
  if (timer === undefined) return { label: 'Timer', icon: 'timer', snooze: null, ...PLAIN };
  return { label: timer.label ?? 'Timer', icon: 'timer', snooze: { kind: 'timer' }, ...PLAIN };
}

export function ringSubjectOf(ref: RingSubjectRef, refs: RingRefs): RingSubject {
  if (ref.kind === 'alarm') return alarmSubjectOf(ref, refs.alarms);
  if (ref.kind === 'timer') return timerSubjectOf(ref, refs.timers);
  const item = refs.items.find((row) => row.id === ref.ref_id);
  return { label: item?.title ?? 'Reminder', icon: 'bell', snooze: null, ...PLAIN };
}

export function snoozesLeftOf(
  limit: number | null,
  snoozes: number,
  phone: { readonly ringing: boolean; readonly snoozesLeft: number | null } | null,
): number | null {
  if (phone?.ringing === true) return phone.snoozesLeft;
  return limit === null ? null : Math.max(0, limit - snoozes);
}

export function snoozeLabelOf(snooze: Exclude<RingSnooze, null>, left: number | null): string {
  const base = snooze.kind === 'alarm' ? `Snooze ${String(snooze.minutes)} min` : 'Add 1 min';
  return left === null ? base : `${base} · ${String(left)} left`;
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

export interface ClockParts {
  readonly digits: string;
  readonly period: string | null;
}

export function clockPartsOf(text: string): ClockParts {
  const digits = text.replace(/[^\d:.]/g, '');
  const period = text.replace(/[\d:.]/g, '').trim();
  return { digits, period: period === '' ? null : period };
}
