import {
  minuteOfClock,
  type API_ENDPOINTS as E,
  type PlannerAlarmRow,
  type PlannerPreferences,
  type PlannerRingTarget,
} from '@smarteverything/domain';
import type { z } from 'zod';
import { twoDigits } from '../../../format/number';
import { hourOf, localDayKey, shiftDay, zonedInstant } from '../../../format/time';
import type { AlarmChange } from '../../planner/data/writes';

export type AlarmDraft = Pick<
  PlannerAlarmRow,
  | 'label'
  | 'time'
  | 'days'
  | 'once_on'
  | 'enabled'
  | 'sound'
  | 'ramp_seconds'
  | 'vibrate'
  | 'snooze_minutes'
  | 'smart_minutes'
  | 'wake_scene_id'
  | 'wake_lead_minutes'
  | 'targets'
>;

export type AlarmEdit = { readonly [K in keyof AlarmDraft]?: AlarmDraft[K] };

export type AlarmCreate = z.input<(typeof E)['createPlannerAlarm']['body']>;

export type ClockDefaults = PlannerPreferences['clock'];

export type RepeatMode = 'once' | 'every_day' | 'weekdays' | 'weekends' | 'custom';

export const DEFAULT_WAKE_LEAD_MINUTES = 20;

const DRAFT_KEYS = [
  'label',
  'time',
  'days',
  'once_on',
  'enabled',
  'sound',
  'ramp_seconds',
  'vibrate',
  'snooze_minutes',
  'smart_minutes',
  'wake_scene_id',
  'wake_lead_minutes',
  'targets',
] as const satisfies readonly (keyof AlarmDraft)[];

const HOURS_IN_DAY = 24;

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6] as const;
const WEEKDAYS = [1, 2, 3, 4, 5] as const;
const WEEKENDS = [0, 6] as const;

const MODE_DAYS: Readonly<Record<Exclude<RepeatMode, 'custom'>, readonly number[]>> = {
  once: [],
  every_day: EVERY_DAY,
  weekdays: WEEKDAYS,
  weekends: WEEKENDS,
};

export function draftOf(alarm: PlannerAlarmRow): AlarmDraft {
  return {
    label: alarm.label,
    time: alarm.time,
    days: alarm.days,
    once_on: alarm.once_on,
    enabled: alarm.enabled,
    sound: alarm.sound,
    ramp_seconds: alarm.ramp_seconds,
    vibrate: alarm.vibrate,
    snooze_minutes: alarm.snooze_minutes,
    smart_minutes: alarm.smart_minutes,
    wake_scene_id: alarm.wake_scene_id,
    wake_lead_minutes: alarm.wake_lead_minutes,
    targets: alarm.targets,
  };
}

export function newDraftOf(defaults: ClockDefaults, time: string): AlarmDraft {
  const scene = defaults.wake_scene_id;
  return {
    label: null,
    time,
    days: [],
    once_on: null,
    enabled: true,
    sound: defaults.sound,
    ramp_seconds: defaults.ramp_seconds,
    vibrate: true,
    snooze_minutes: defaults.snooze_minutes,
    smart_minutes: null,
    wake_scene_id: scene,
    wake_lead_minutes: scene === null ? null : DEFAULT_WAKE_LEAD_MINUTES,
    targets: defaults.targets,
  };
}

export function appliedEdit(draft: AlarmDraft, edit: AlarmEdit): AlarmDraft {
  return { ...draft, ...edit };
}

export function createBodyOf(draft: AlarmDraft): AlarmCreate {
  return { ...draft, days: [...draft.days], targets: [...draft.targets] };
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function changeOf(alarm: PlannerAlarmRow, edit: AlarmEdit): AlarmChange | null {
  const draft = draftOf(alarm);
  const next = appliedEdit(draft, edit);
  return DRAFT_KEYS.some((key) => !sameValue(draft[key], next[key])) ? edit : null;
}

function sameDays(days: readonly number[], set: readonly number[]): boolean {
  return days.length === set.length && set.every((day) => days.includes(day));
}

export function repeatModeOf(draft: Pick<AlarmDraft, 'days'>): RepeatMode {
  if (draft.days.length === 0) return 'once';
  if (sameDays(draft.days, EVERY_DAY)) return 'every_day';
  if (sameDays(draft.days, WEEKDAYS)) return 'weekdays';
  return sameDays(draft.days, WEEKENDS) ? 'weekends' : 'custom';
}

function sortedDays(days: readonly number[]): readonly number[] {
  return [...days].sort((left, right) => left - right);
}

export function daysEdit(days: readonly number[]): AlarmEdit {
  return { days: sortedDays(days), once_on: null };
}

export function repeatEdit(mode: RepeatMode, current: readonly number[]): AlarmEdit {
  if (mode === 'custom') return daysEdit(current.length === 0 ? WEEKDAYS : current);
  return daysEdit(MODE_DAYS[mode]);
}

export function toggledDayEdit(days: readonly number[], day: number): AlarmEdit {
  return daysEdit(days.includes(day) ? days.filter((entry) => entry !== day) : [...days, day]);
}

export function onceOnEdit(date: string | null): AlarmEdit {
  return date === null ? { once_on: null } : { once_on: date, days: [] };
}

export function firstOnceDateOf(time: string, now: number, timeZone: string): string {
  const today = localDayKey(now, timeZone);
  const ringsToday = zonedInstant(today, minuteOfClock(time), timeZone) > now;
  return ringsToday ? today : shiftDay(today, 1);
}

export function wakeEdit(sceneId: string | null, leadMinutes: number): AlarmEdit {
  return sceneId === null
    ? { wake_scene_id: null, wake_lead_minutes: null }
    : { wake_scene_id: sceneId, wake_lead_minutes: leadMinutes };
}

export function targetKeyOf(target: PlannerRingTarget): string {
  return target.kind === 'client' ? `client:${target.clientId}` : `device:${target.deviceId}`;
}

export function hasTarget(
  targets: readonly PlannerRingTarget[],
  target: PlannerRingTarget,
): boolean {
  const key = targetKeyOf(target);
  return targets.some((entry) => targetKeyOf(entry) === key);
}

export function toggledTargetsEdit(
  targets: readonly PlannerRingTarget[],
  target: PlannerRingTarget,
): AlarmEdit {
  const key = targetKeyOf(target);
  return {
    targets: hasTarget(targets, target)
      ? targets.filter((entry) => targetKeyOf(entry) !== key)
      : [...targets, target],
  };
}

export function labelEdit(text: string): AlarmEdit {
  const label = text.trim();
  return { label: label === '' ? null : label };
}

export function newAlarmTimeOf(now: number, timeZone: string): string {
  return `${twoDigits((hourOf(new Date(now), timeZone) + 1) % HOURS_IN_DAY)}:00`;
}
