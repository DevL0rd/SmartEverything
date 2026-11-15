import type { SelectOption } from '../../../components/select-picker';
import type { ColourRole } from '../../../design/tokens';
import { plural } from '../../../format/text';
import { DAY_MS, HOUR_MS, shortDate } from '../../../format/time';

export const GRANT_ENDS = ['never', 'day', 'week', 'month', 'date'] as const;

export type GrantEnd = (typeof GRANT_ENDS)[number];

type PresetEnd = Exclude<GrantEnd, 'never' | 'date'>;

const PRESET_DAYS: Readonly<Record<PresetEnd, number>> = { day: 1, week: 7, month: 30 };

const PRESET_LABEL: Readonly<Record<PresetEnd, string>> = {
  day: '1 day',
  week: '7 days',
  month: '30 days',
};

const LATEST_MOMENT = Date.parse('9999-12-31T23:59:59.999Z');

export const NO_END_LABEL = 'No end';

export function endLabelOf(expiresAt: string | null, now: number): string {
  if (expiresAt === null) return NO_END_LABEL;
  const left = Date.parse(expiresAt) - now;
  if (left <= 0) return 'Ended';
  if (left < HOUR_MS) return 'Ends within the hour';
  if (left < DAY_MS) return `Ends in ${plural(Math.floor(left / HOUR_MS), 'hour')}`;
  return `Ends in ${plural(Math.floor(left / DAY_MS), 'day')}`;
}

export function endsSoon(expiresAt: string | null, now: number): boolean {
  return expiresAt !== null && Date.parse(expiresAt) - now < DAY_MS;
}

export function grantEndOf(expiresAt: string | null): GrantEnd {
  return expiresAt === null ? 'never' : 'date';
}

export function grantEndOptionsOf(
  expiresAt: string | null,
  now: number,
): readonly SelectOption<GrantEnd>[] {
  return [
    { value: 'never', label: NO_END_LABEL },
    { value: 'day', label: PRESET_LABEL.day },
    { value: 'week', label: PRESET_LABEL.week },
    { value: 'month', label: PRESET_LABEL.month },
    {
      value: 'date',
      label:
        expiresAt === null
          ? 'Pick a date'
          : `${shortDate(expiresAt)} · ${endLabelOf(expiresAt, now)}`,
    },
  ];
}

export function presetEndAt(end: PresetEnd, now: number): string {
  return new Date(now + PRESET_DAYS[end] * DAY_MS).toISOString();
}

export function isPresetEnd(end: GrantEnd): end is PresetEnd {
  return end === 'day' || end === 'week' || end === 'month';
}

export function endOfDayAfter(now: number, days: number): string {
  const day = new Date(now);
  day.setHours(23, 59, 59, 999);
  day.setDate(day.getDate() + days);
  return new Date(Math.min(day.getTime(), LATEST_MOMENT)).toISOString();
}

export function latestDayCount(now: number): number {
  return Math.floor((LATEST_MOMENT - now) / DAY_MS);
}

export function dayCountOf(expiresAt: string | null, now: number): number {
  if (expiresAt === null) return PRESET_DAYS.week;
  const start = new Date(now);
  start.setHours(23, 59, 59, 999);
  return Math.max(1, Math.round((Date.parse(expiresAt) - start.getTime()) / DAY_MS));
}

export function timeLeftShareOf(
  grant: { readonly createdAt: string; readonly expiresAt: string | null },
  now: number,
): number | null {
  if (grant.expiresAt === null) return null;
  const end = Date.parse(grant.expiresAt);
  const span = end - Date.parse(grant.createdAt);
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (end - now) / span));
}

export function timeLeftColourOf(expiresAt: string | null, now: number): ColourRole {
  return endsSoon(expiresAt, now) ? 'warning' : 'primary';
}
