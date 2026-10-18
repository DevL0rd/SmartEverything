import {
  insideClockWindow,
  isExpired,
  localClock,
  minuteOfClock,
  type AccessConditions,
  type PersonAccess,
  type PersonAccessChange,
  type PersonRole,
  type PersonTemplate,
  type QuietHours,
  type Role,
} from '@smarteverything/domain';
import { joinParts } from '../../../format/text';
import { DAY_MS, HOUR_MS, MINUTE_MS, relative } from '../../../format/time';
import type { BadgeTone } from '../../../components/badge';

export const PERSON_ROLE_LABEL: Readonly<Record<PersonRole, string>> = {
  owner: 'Owner',
  member: 'Member',
  guest: 'Guest',
};

export const PERSON_ROLE_HELP: Readonly<Record<PersonRole, string>> = {
  owner: 'Can also change settings and pair phones',
  member: 'Can use devices, cameras and automations',
  guest: 'Like a member, until the end time',
};

export const PERSON_ROLE_ORDER: readonly PersonRole[] = ['owner', 'member', 'guest'];

const TEMPLATE_OF_ROLE: Readonly<Record<PersonRole, PersonTemplate>> = {
  owner: 'owner',
  member: 'adult',
  guest: 'guest',
};

export function deviceRoleOf(role: PersonRole): Role {
  return role === 'owner' ? 'owner' : 'member';
}

export type Standing =
  | { readonly kind: 'owner' }
  | { readonly kind: 'ended' }
  | { readonly kind: 'paused'; readonly resumesAt: string }
  | { readonly kind: 'active'; readonly endsAt: string | null };

export function standingOf(access: PersonAccess, now: number, timeZone: string): Standing {
  if (access.role === 'owner') {
    return { kind: 'owner' };
  }
  if (isExpired(access, new Date(now).toISOString())) {
    return { kind: 'ended' };
  }
  const { schedule } = access.conditions;
  if (schedule !== null && insideClockWindow(schedule, minuteOfDayIn(now, timeZone))) {
    return { kind: 'paused', resumesAt: schedule.to };
  }
  return { kind: 'active', endsAt: access.expires_at };
}

function minuteOfDayIn(now: number, timeZone: string): number {
  return localClock(new Date(now), timeZone).minuteOfDay;
}

export function timeLeftText(endsAt: string, now: number): string {
  const left = Date.parse(endsAt) - now;
  if (left < MINUTE_MS) {
    return 'under a minute';
  }
  if (left < HOUR_MS) {
    return `${String(Math.floor(left / MINUTE_MS))} min`;
  }
  if (left < DAY_MS) {
    return `${String(Math.floor(left / HOUR_MS))} h`;
  }
  return `${String(Math.floor(left / DAY_MS))} d`;
}

export function endsText(expiresAt: string | null, now: number): string {
  if (expiresAt === null) {
    return 'Never';
  }
  return Date.parse(expiresAt) <= now ? 'Ended' : `In ${timeLeftText(expiresAt, now)}`;
}

export function standingText(standing: Standing, now: number): string {
  switch (standing.kind) {
    case 'owner':
      return 'Full access';
    case 'ended':
      return 'Access ended';
    case 'paused':
      return `Paused until ${standing.resumesAt}`;
    case 'active':
      return standing.endsAt === null
        ? 'Active'
        : `Active, ends in ${timeLeftText(standing.endsAt, now)}`;
  }
}

export function endedText(expiresAt: string, now: number): string {
  return `Ended ${relative(expiresAt, now)}`;
}

export function canEndNow(standing: Standing): boolean {
  return standing.kind === 'active' || standing.kind === 'paused';
}

export function standingTone(standing: Standing): BadgeTone {
  switch (standing.kind) {
    case 'owner':
      return 'primary';
    case 'ended':
      return 'critical';
    case 'paused':
      return 'warning';
    case 'active':
      return 'positive';
  }
}

export function windowText(schedule: QuietHours | null): string {
  return schedule === null ? 'Never paused' : `${schedule.from}–${schedule.to}`;
}

export function conditionsText(conditions: AccessConditions): string {
  const text = joinParts([
    conditions.home_only ? 'Home network only' : null,
    conditions.schedule === null ? null : `Paused ${windowText(conditions.schedule)}`,
  ]);
  return text === '' ? 'No limits' : text;
}

export interface DaySegment {
  readonly start: number;
  readonly end: number;
}

const MINUTES_PER_DAY = 1440;

export function windowSegments(schedule: QuietHours | null): readonly DaySegment[] {
  if (schedule === null) {
    return [];
  }
  const from = minuteOfClock(schedule.from) / MINUTES_PER_DAY;
  const to = minuteOfClock(schedule.to) / MINUTES_PER_DAY;
  if (from === to) {
    return [];
  }
  return from < to
    ? [{ start: from, end: to }]
    : [
        { start: from, end: 1 },
        { start: 0, end: to },
      ];
}

export const PAUSED_WINDOW: QuietHours = { from: '22:00', to: '07:00', urgent: false };

export interface EndPreset {
  readonly id: string;
  readonly label: string;
  readonly ms: number;
}

export const END_PRESETS: readonly EndPreset[] = [
  { id: 'day', label: 'In 1 day', ms: DAY_MS },
  { id: 'week', label: 'In 1 week', ms: 7 * DAY_MS },
  { id: 'month', label: 'In 30 days', ms: 30 * DAY_MS },
];

const GUEST_DEFAULT_MS = DAY_MS;

export function endAfter(now: number, ms: number): string {
  return new Date(now + ms).toISOString();
}

export function roleChange(
  role: PersonRole,
  before: Pick<PersonAccess, 'expires_at'>,
  now: number,
): PersonAccessChange {
  const template = TEMPLATE_OF_ROLE[role];
  if (role === 'owner') {
    return { role, template, expires_at: null };
  }
  if (role === 'guest' && before.expires_at === null) {
    return { role, template, expires_at: endAfter(now, GUEST_DEFAULT_MS) };
  }
  return { role, template };
}
