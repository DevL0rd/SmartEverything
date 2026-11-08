import {
  PLANNER_BRIEFINGS,
  PLANNER_CALENDAR_VIEWS,
  PLANNER_COLOUR_KEYS,
  PLANNER_FADE_STRENGTHS,
  PLANNER_MISSED_SCOPES,
  type PLANNER_SMART_LISTS,
  type PlannerColourKey,
  type PlannerRingTarget,
} from '@smarteverything/domain';
import type { SelectOption } from '../../../components/select-picker';
import type { TimeOfDay } from '../../../components/time-field';
import { twoDigits } from '../../../format/number';
import { plural } from '../../../format/text';
import { shortClock } from '../../../format/time';
import type { GoogleAccountView } from '../data';

export type Option = SelectOption<string>;

export type SmartList = (typeof PLANNER_SMART_LISTS)[number];

export const NONE = 'none';

export const MINUTES_IN_HOUR = 60;

const MINUTES_IN_DAY = 24 * MINUTES_IN_HOUR;

export const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export const SMART_LIST_LABELS: Readonly<Record<SmartList, string>> = {
  today: 'Today',
  upcoming: 'Upcoming',
  overdue: 'Overdue',
  device_tasks: 'Device tasks',
  habits: 'Habits',
  someday: 'Someday',
  completed: 'Completed',
};

const CALENDAR_COLOUR_LABELS: Readonly<Record<PlannerColourKey, string>> = {
  work: 'Work',
  family: 'Family',
  personal: 'Personal',
  health: 'Health',
  home: 'Home',
  shopping: 'Shopping',
};

const CALENDAR_SWATCH: Readonly<Record<PlannerColourKey, string>> = {
  work: 'bg-viz-6',
  family: 'bg-viz-1',
  personal: 'bg-viz-3',
  health: 'bg-positive',
  home: 'bg-viz-4',
  shopping: 'bg-viz-5',
};

export const COLOUR_OPTIONS = PLANNER_COLOUR_KEYS.map((value) => ({
  value,
  label: CALENDAR_COLOUR_LABELS[value],
  swatchClassName: CALENDAR_SWATCH[value],
}));

export const CALENDAR_SHOWS = [
  { key: 'show_tasks', title: 'Tasks', icon: 'listCheck' },
  { key: 'show_alarms', title: 'Alarms', icon: 'alarmClock' },
  { key: 'show_sleep', title: 'Sleep', icon: 'moon' },
  { key: 'show_free_time', title: 'Free time', icon: 'sun' },
] as const;

export type CalendarShowKey = (typeof CALENDAR_SHOWS)[number]['key'];

function labelled(values: readonly string[], labels: readonly string[]): Option[] {
  return values.map((value, index) => ({ value, label: labels[index] ?? value }));
}

export function beforeText(minutes: number): string {
  if (minutes === 0) return 'At the start';
  if (minutes % MINUTES_IN_DAY === 0) return `${plural(minutes / MINUTES_IN_DAY, 'day')} before`;
  if (minutes % MINUTES_IN_HOUR === 0) return `${plural(minutes / MINUTES_IN_HOUR, 'hour')} before`;
  return `${String(minutes)} min before`;
}

export function rampText(seconds: number): string {
  if (seconds === 0) return 'Off';
  return seconds % 60 === 0
    ? `Over ${plural(seconds / 60, 'minute')}`
    : `Over ${String(seconds)} s`;
}

function withCurrent(options: readonly Option[], value: string, label: string): readonly Option[] {
  return options.some((option) => option.value === value)
    ? options
    : [...options, { value, label }];
}

const REMINDER_MINUTES = [0, 5, 10, 15, 30, 60, 1440] as const;

const RAMP_SECONDS = [0, 15, 30, 60, 120] as const;

export const WEEK_OPTIONS: readonly Option[] = DAY_NAMES.map((label, day) => ({
  value: String(day),
  label,
}));

export const FADE_OPTIONS = labelled(PLANNER_FADE_STRENGTHS, ['Off', 'Soft', 'Strong']);

export const MISSED_OPTIONS = labelled(PLANNER_MISSED_SCOPES, ['Since last open', 'Today only']);

export const VIEW_OPTIONS = labelled(PLANNER_CALENDAR_VIEWS, [
  'Day',
  '3 days',
  'Week',
  'Month',
  'Year',
  'Agenda',
  'People',
]);

export const BRIEFING_OPTIONS = labelled(PLANNER_BRIEFINGS, [
  'Off',
  'After the alarm',
  'At day start',
]);

export const DEFAULT_SOUND = 'default';

export function soundOptions(current: string): readonly Option[] {
  return withCurrent([{ value: DEFAULT_SOUND, label: 'Phone default' }], current, current);
}

export function reminderOptions(current: string): readonly Option[] {
  const options = [
    { value: NONE, label: 'None' },
    ...REMINDER_MINUTES.map((minutes) => ({ value: String(minutes), label: beforeText(minutes) })),
  ];
  return current === NONE ? options : withCurrent(options, current, beforeText(Number(current)));
}

export function rampOptions(current: string): readonly Option[] {
  const options = RAMP_SECONDS.map((seconds) => ({
    value: String(seconds),
    label: rampText(seconds),
  }));
  return withCurrent(options, current, rampText(Number(current)));
}

export function picked<T extends string>(values: readonly T[], value: string): T {
  const found = values.find((entry) => entry === value);
  if (found === undefined) {
    throw new RangeError(`${value} is not one of ${values.join(', ')}.`);
  }
  return found;
}

export function idOrNull(value: string): string | null {
  return value === NONE ? null : value;
}

export function timeOfClockText(text: string): TimeOfDay {
  const [hour = '0', minute = '0'] = text.split(':');
  return { hour: Number(hour), minute: Number(minute) };
}

export function clockTextOf(time: TimeOfDay): string {
  return `${twoDigits(time.hour)}:${twoDigits(time.minute)}`;
}

export function spanText(start: string, end: string): string {
  return `${start} to ${end}`;
}

export function shownCount(shown: number, all: number): string {
  if (shown === 0) return 'None';
  return shown === all ? `All ${String(all)}` : `${String(shown)} shown`;
}

export function onCount(on: number): string {
  return on === 0 ? 'None' : `${String(on)} on`;
}

export function ringsOnClient(target: PlannerRingTarget, clientId: string): boolean {
  return target.kind === 'client' && target.clientId === clientId;
}

export function googleRowText(view: GoogleAccountView): string {
  if (view.needsAttention) return 'Needs attention';
  if (!view.linked) return 'Not linked';
  const linked = view.email === null ? 'Linked' : `Linked as ${view.email}`;
  return view.lastSyncAt === null ? linked : `${linked} · synced ${shortClock(view.lastSyncAt)}`;
}
