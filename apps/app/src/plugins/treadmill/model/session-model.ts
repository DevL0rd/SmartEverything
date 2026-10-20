import {
  addDays,
  appendTo,
  dayNumber,
  sessionDayOf,
  type SessionKind,
  type SessionSource,
  type TreadmillSession,
} from '@smarteverything/domain';
import { decimal } from '../../../format/number';
import { clockText, distanceFigure } from './treadmill-model';

export const KIND_LABEL: Readonly<Record<SessionKind, string>> = {
  walk: 'Walk',
  jog: 'Jog',
  run: 'Run',
  intervals: 'Intervals',
};

const SOURCE_BADGE: Readonly<Record<SessionSource, string | null>> = {
  live: null,
  pad_summary: 'Summary from the belt',
  pad_record: 'Stored on the belt',
};

const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const MORNING_FROM = 5;
const AFTERNOON_FROM = 12;
const EVENING_FROM = 17;
const NIGHT_FROM = 22;

function localHour(iso: string, zoneOffsetSeconds: number): number {
  return Number(new Date(Date.parse(iso) + zoneOffsetSeconds * 1000).toISOString().slice(11, 13));
}

function localTime(iso: string, zoneOffsetSeconds: number): string {
  return new Date(Date.parse(iso) + zoneOffsetSeconds * 1000).toISOString().slice(11, 16);
}

function partOfDay(hour: number): string {
  if (hour >= NIGHT_FROM || hour < MORNING_FROM) {
    return 'Night';
  }
  if (hour < AFTERNOON_FROM) {
    return 'Morning';
  }
  return hour < EVENING_FROM ? 'Afternoon' : 'Evening';
}

export function sessionTitle(session: TreadmillSession): string {
  const hour = localHour(session.startedAt, session.zoneOffsetSeconds);
  const kind = KIND_LABEL[session.kind].toLowerCase();
  return `${partOfDay(hour)} ${kind}`;
}

export function dayLabel(day: string, today: string): string {
  if (day === today) {
    return 'Today';
  }
  if (day === addDays(today, -1)) {
    return 'Yesterday';
  }
  const weekday = WEEKDAY_NAMES[(dayNumber(day) + 3) % 7] ?? '';
  const month = MONTH_NAMES[Number(day.slice(5, 7)) - 1] ?? '';
  return `${weekday} ${String(Number(day.slice(8, 10)))} ${month}`;
}

export function whenText(session: TreadmillSession, today: string): string {
  const day = sessionDayOf(session.startedAt, session.zoneOffsetSeconds);
  return `${dayLabel(day, today)}, ${localTime(session.startedAt, session.zoneOffsetSeconds)}`;
}

export function sessionLine(session: TreadmillSession): string {
  const distance = distanceFigure(session.distanceM);
  return `${distance.value} ${distance.unit} · ${clockText(session.activeSeconds)} · ${decimal(session.avgKmh, 1)} km/h`;
}

export function sourceBadge(session: TreadmillSession): string | null {
  return SOURCE_BADGE[session.source];
}

export interface SessionGroup {
  readonly day: string;
  readonly label: string;
  readonly sessions: readonly TreadmillSession[];
}

export function groupSessions(
  sessions: readonly TreadmillSession[],
  today: string,
): readonly SessionGroup[] {
  const groups = new Map<string, TreadmillSession[]>();
  for (const session of sessions) {
    const day = sessionDayOf(session.startedAt, session.zoneOffsetSeconds);
    appendTo(groups, day, session);
  }
  return [...groups].map(([day, list]) => ({ day, label: dayLabel(day, today), sessions: list }));
}
