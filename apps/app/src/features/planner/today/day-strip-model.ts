import {
  minuteOfClock,
  sunEventOn,
  type CalendarDate,
  type GeoPoint,
  type PlannerCollectionRow,
  type PlannerColourKey,
  type PlannerDay,
  type PlannerPreferences,
  type PlannerStats,
  type PlannerStripSegment,
  type PlannerTimerRow,
  type WeatherHour,
} from '@smarteverything/domain';
import type { Bar, TimelineSegment } from '../../../components/charts';
import { CALENDAR_COLOUR } from '../../../design/data-colours';
import type { ColourRole } from '../../../design/tokens';
import { decimal, percent } from '../../../format/number';
import {
  DAY_MS,
  HOUR_MS,
  MINUTE_MS,
  clock,
  dayBoundsOf,
  hoursMinutes,
  zonedInstant,
} from '../../../format/time';

export type StripState = 'daylight' | 'sleep' | 'event' | PlannerColourKey;

export const STRIP_COLOURS: Readonly<Record<StripState, ColourRole>> = {
  daylight: 'primary-container',
  sleep: 'sleep-band',
  event: 'on-surface-variant',
  ...CALENDAR_COLOUR,
};

export type StripMarkTone = 'done' | 'missed' | 'open';

export interface StripMark {
  readonly at: number;
  readonly tone: StripMarkTone;
}

export interface StripHour {
  readonly at: number;
  readonly label: string;
}

export interface StripSun {
  readonly rise: number;
  readonly set: number;
}

export interface DayStripModel {
  readonly from: number;
  readonly to: number;
  readonly segments: readonly TimelineSegment<StripState>[];
  readonly alarms: readonly number[];
  readonly marks: readonly StripMark[];
  readonly hours: readonly StripHour[];
  readonly sun: StripSun | null;
  readonly sleepMinutes: number;
  readonly label: string;
}

export interface DayStripInput {
  readonly day: PlannerDay;
  readonly collections: readonly PlannerCollectionRow[];
  readonly place: GeoPoint | null;
  readonly showSleep: boolean;
}

interface Window {
  readonly from: number;
  readonly to: number;
}

const HOUR_LABELS: readonly number[] = [0, 6, 12, 18, 24];

export function calendarDateOf(date: string): CalendarDate {
  const [year = 0, month = 0, day = 0] = date.split('-').map(Number);
  return { year, month, day };
}

function clipped(segment: PlannerStripSegment, window: Window): Window | null {
  const from = Math.max(window.from, Date.parse(segment.from));
  const to = Math.min(window.to, Date.parse(segment.to));
  return to > from ? { from, to } : null;
}

export function sunOf(date: string, place: GeoPoint | null): StripSun | null {
  if (place === null) return null;
  const calendar = calendarDateOf(date);
  const rise = sunEventOn('sunrise', calendar, place);
  const set = sunEventOn('sunset', calendar, place);
  if (rise === null || set === null || set <= rise) return null;
  return { rise: rise.getTime(), set: set.getTime() };
}

function daylightOf(sun: StripSun | null, window: Window): TimelineSegment<StripState>[] {
  if (sun === null) return [];
  const start = Math.max(window.from, sun.rise);
  const end = Math.min(window.to, sun.set);
  return end > start ? [{ start, end, state: 'daylight' }] : [];
}

function colourKeyOf(
  segment: PlannerStripSegment,
  colours: ReadonlyMap<string, PlannerColourKey>,
): StripState {
  if (segment.collection_id === null) return 'event';
  return colours.get(segment.collection_id) ?? 'event';
}

function blocksOf(
  input: DayStripInput,
  kind: 'sleep' | 'event',
  window: Window,
): TimelineSegment<StripState>[] {
  const colours = new Map(input.collections.map((row) => [row.id, row.colour] as const));
  return input.day.strip.flatMap((segment) => {
    if (segment.kind !== kind) return [];
    const span = clipped(segment, window);
    if (span === null) return [];
    const state = kind === 'sleep' ? 'sleep' : colourKeyOf(segment, colours);
    return [{ start: span.from, end: span.to, state }];
  });
}

function statusesOf(day: PlannerDay): ReadonlyMap<string, StripMarkTone> {
  return new Map<string, StripMarkTone>([
    ...day.missed.map((view) => [view.item_id, 'missed'] as const),
    ...day.done.map((view) => [view.item_id, 'done'] as const),
  ]);
}

function inside(at: number, window: Window): boolean {
  return at >= window.from && at <= window.to;
}

function marksOf(day: PlannerDay, window: Window): StripMark[] {
  const statuses = statusesOf(day);
  return day.strip.flatMap((segment) => {
    const at = Date.parse(segment.from);
    if (segment.kind !== 'task' || !inside(at, window)) return [];
    const tone = segment.item_id === null ? 'open' : (statuses.get(segment.item_id) ?? 'open');
    return [{ at, tone }];
  });
}

function alarmsOf(day: PlannerDay, window: Window): number[] {
  return day.strip.flatMap((segment) => {
    const at = Date.parse(segment.from);
    return segment.kind === 'alarm' && inside(at, window) ? [at] : [];
  });
}

function hoursOf(day: PlannerDay, window: Window): StripHour[] {
  return HOUR_LABELS.map((hour) => ({
    at: hour === 24 ? window.to : zonedInstant(day.date, hour * 60, day.time_zone),
    label: String(hour).padStart(2, '0'),
  }));
}

function minutesIn(segments: readonly TimelineSegment<StripState>[]): number {
  return segments.reduce((sum, segment) => sum + (segment.end - segment.start), 0) / MINUTE_MS;
}

function plural(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

function labelOf(model: Omit<DayStripModel, 'label'>, events: number, timeZone: string): string {
  const missed = model.marks.filter((mark) => mark.tone === 'missed').length;
  const parts = [
    plural(events, 'event', 'events'),
    plural(model.alarms.length, 'alarm', 'alarms'),
    plural(model.marks.length, 'task', 'tasks'),
    ...(missed > 0 ? [`${String(missed)} missed`] : []),
    ...(model.sleepMinutes > 0 ? [`slept ${hoursMinutes(model.sleepMinutes)}`] : []),
    ...(model.sun === null
      ? []
      : [`sunrise ${clock(model.sun.rise, timeZone)}, sunset ${clock(model.sun.set, timeZone)}`]),
  ];
  return `Your day: ${parts.join(', ')}`;
}

export function dayStripOf(input: DayStripInput): DayStripModel {
  const bounds = dayBoundsOf(input.day.date, input.day.time_zone);
  const window = { from: bounds.start, to: bounds.end };
  const sun = sunOf(input.day.date, input.place);
  const sleep = input.showSleep ? blocksOf(input, 'sleep', window) : [];
  const events = blocksOf(input, 'event', window);
  const model = {
    ...window,
    segments: [...daylightOf(sun, window), ...sleep, ...events],
    alarms: alarmsOf(input.day, window),
    marks: marksOf(input.day, window),
    hours: hoursOf(input.day, window),
    sun,
    sleepMinutes: Math.round(minutesIn(sleep)),
  };
  return { ...model, label: labelOf(model, events.length, input.day.time_zone) };
}

export function nowIn(model: Pick<DayStripModel, 'from' | 'to'>, now: number): number | null {
  return now >= model.from && now <= model.to ? now : null;
}

export function bookedMinutesOf(day: PlannerDay): number {
  const bounds = dayBoundsOf(day.date, day.time_zone);
  const window = { from: bounds.start, to: bounds.end };
  const spans = day.strip
    .flatMap((segment) => (segment.kind === 'event' ? [clipped(segment, window)] : []))
    .filter((span) => span !== null)
    .sort((left, right) => left.from - right.from);
  const merged = spans.reduce<Window[]>((all, span) => {
    const last = all.at(-1);
    if (last !== undefined && span.from <= last.to) {
      return [...all.slice(0, -1), { from: last.from, to: Math.max(last.to, span.to) }];
    }
    return [...all, span];
  }, []);
  return merged.reduce((sum, span) => sum + (span.to - span.from), 0) / MINUTE_MS;
}

export type TodayRingKey = 'tasks' | 'focus' | 'move';

export interface TodayRing {
  readonly key: TodayRingKey;
  readonly label: string;
  readonly progress: number;
  readonly value: string;
  readonly brief: string;
  readonly colour: ColourRole;
}

export interface TodayRingsInput {
  readonly day: PlannerDay;
  readonly workingHours: PlannerPreferences['general']['working_hours'] | null;
  readonly move: number | null;
}

const COUNTED: ReadonlySet<string> = new Set(['open', 'done', 'missed']);

function tasksOf(day: PlannerDay): { readonly done: number; readonly planned: number } {
  const all = [...day.missed, ...day.current, ...day.upcoming, ...day.done].filter(
    (view) => view.kind === 'task' && COUNTED.has(view.status),
  );
  return { done: all.filter((view) => view.status === 'done').length, planned: all.length };
}

function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

export function focusGoalMinutesOf(
  date: string,
  hours: TodayRingsInput['workingHours'],
): number | null {
  if (hours?.days.includes(weekdayOf(date)) !== true) return null;
  const minutes = minuteOfClock(hours.end) - minuteOfClock(hours.start);
  return minutes > 0 ? minutes : null;
}

function hoursText(minutes: number): string {
  return decimal(minutes / 60, minutes % 60 === 0 ? 0 : 1);
}

function share(value: number, goal: number | null): number {
  return goal === null || goal === 0 ? 0 : value / goal;
}

export function todayRingsOf({ day, workingHours, move }: TodayRingsInput): readonly TodayRing[] {
  const tasks = tasksOf(day);
  const booked = bookedMinutesOf(day);
  const goal = focusGoalMinutesOf(day.date, workingHours);
  const moved = move === null ? 'No data' : percent(move);
  return [
    {
      key: 'tasks',
      label: 'Tasks',
      progress: share(tasks.done, tasks.planned),
      value: `${String(tasks.done)} / ${String(tasks.planned)}`,
      brief: `${String(tasks.done)} of ${String(tasks.planned)}`,
      colour: 'primary',
    },
    {
      key: 'focus',
      label: 'Focus',
      progress: share(booked, goal),
      value:
        goal === null ? `${hoursText(booked)} h` : `${hoursText(booked)} / ${hoursText(goal)} h`,
      brief: `${hoursText(booked)} h`,
      colour: 'viz-1',
    },
    {
      key: 'move',
      label: 'Move',
      progress: move ?? 0,
      value: moved,
      brief: moved,
      colour: 'viz-4',
    },
  ];
}

export interface OnTimeModel {
  readonly share: number | null;
  readonly bars: readonly Bar[];
  readonly today: string;
  readonly label: string;
}

const DAY_LETTERS: readonly string[] = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function dayTotals(stats: PlannerStats): ReadonlyMap<string, { done: number; due: number }> {
  const totals = new Map<string, { done: number; due: number }>();
  for (const point of stats.list_trends.flatMap((trend) => trend.points)) {
    const known = totals.get(point.day) ?? { done: 0, due: 0 };
    totals.set(point.day, { done: known.done + point.done, due: known.due + point.due });
  }
  return totals;
}

function daysFrom(from: string, to: string): string[] {
  const start = Date.parse(`${from}T12:00:00Z`);
  const count = Math.round((Date.parse(`${to}T12:00:00Z`) - start) / DAY_MS) + 1;
  return Array.from({ length: Math.max(0, count) }, (_, index) =>
    new Date(start + index * DAY_MS).toISOString().slice(0, 10),
  );
}

export function onTimeShareOf(stats: PlannerStats): number | null {
  const total = stats.on_time.on_time + stats.on_time.late;
  return total === 0 ? null : stats.on_time.on_time / total;
}

export function onTimeOf(stats: PlannerStats): OnTimeModel {
  const totals = dayTotals(stats);
  const bars = daysFrom(stats.from, stats.to).map((day) => {
    const tally = totals.get(day) ?? { done: 0, due: 0 };
    return {
      key: day,
      value: tally.due === 0 ? 0 : tally.done / tally.due,
      label: DAY_LETTERS[weekdayOf(day)] ?? '',
    };
  });
  const value = onTimeShareOf(stats);
  return {
    share: value,
    bars,
    today: stats.to,
    label: value === null ? 'Nothing due yet' : `On time ${percent(value)}`,
  };
}

export function timerLeftMs(timer: PlannerTimerRow, now: number): number | null {
  if (timer.state === 'running' && timer.ends_at !== null) {
    return Math.max(0, Date.parse(timer.ends_at) - now);
  }
  return timer.state === 'paused' ? timer.remaining_ms : null;
}

export function liveTimersOf(timers: readonly PlannerTimerRow[]): readonly PlannerTimerRow[] {
  return timers.filter((timer) => timer.state === 'running' || timer.state === 'paused');
}

export interface PlanPrompt {
  readonly tasks: number;
  readonly slots: number;
  readonly until: number;
}

export function planPromptOf(day: PlannerDay, now: number): PlanPrompt | null {
  const tasks = [...day.missed, ...day.current, ...day.upcoming].filter(
    (view) =>
      view.kind === 'task' &&
      view.start === null &&
      (view.status === 'open' || view.status === 'missed'),
  ).length;
  const slots = day.strip.filter(
    (segment) => segment.kind === 'free' && Date.parse(segment.to) > now,
  );
  const until = Math.max(...slots.map((segment) => Date.parse(segment.to)));
  return tasks === 0 || slots.length === 0 ? null : { tasks, slots: slots.length, until };
}

export function rainBarsOf(
  hours: readonly WeatherHour[],
  now: number,
  end: number,
): readonly Bar[] {
  const ahead = hours.filter(
    (hour) => Date.parse(hour.at) + HOUR_MS > now && Date.parse(hour.at) < end,
  );
  if (!ahead.some((hour) => hour.precipitationMm > 0)) return [];
  return ahead.map((hour) => ({ key: hour.at, value: hour.precipitationMm }));
}
