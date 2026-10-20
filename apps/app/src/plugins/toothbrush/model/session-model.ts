import {
  BRUSH_MODE_LABELS,
  addDays,
  dayNumber,
  localHourOf,
  sessionDayOf,
  PRESSURE_CODE_TOO_HIGH,
  stepsOf,
  zoneNamesOf,
  zonesMissed,
  zonesReached,
  type BrushPressure,
  type BrushProfile,
  type BrushingSession,
  type ZoneSource,
} from '@smarteverything/domain';
import { clockText, secondsText } from './brush-model';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

const MONTHS = [
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

const MORNING_FROM = 4;
const AFTERNOON_FROM = 12;
const EVENING_FROM = 17;

export function partOfDay(
  session: Pick<BrushingSession, 'startedAt' | 'zoneOffsetSeconds'>,
): string {
  const hour = localHourOf(session);
  if (hour >= EVENING_FROM || hour < MORNING_FROM) {
    return 'Evening';
  }
  return hour < AFTERNOON_FROM ? 'Morning' : 'Afternoon';
}

export function sessionTitle(session: BrushingSession): string {
  const mode = session.mode === null ? 'Brushing' : BRUSH_MODE_LABELS[session.mode];
  return `${partOfDay(session)} · ${mode}`;
}

export function dayOfSession(session: BrushingSession): string {
  return sessionDayOf(session.startedAt, session.zoneOffsetSeconds);
}

export function localTime(session: BrushingSession): string {
  return new Date(Date.parse(session.startedAt) + session.zoneOffsetSeconds * 1000)
    .toISOString()
    .slice(11, 16);
}

export function dayLabel(day: string, today: string): string {
  if (day === today) {
    return 'Today';
  }
  if (day === addDays(today, -1)) {
    return 'Yesterday';
  }
  const weekday = WEEKDAYS[(dayNumber(day) + 3) % 7] ?? '';
  const month = MONTHS[Number(day.slice(5, 7)) - 1] ?? '';
  return `${weekday} ${String(Number(day.slice(8, 10)))} ${month}`;
}

export interface Result {
  readonly word: string;
  readonly tone: 'positive' | 'warning';
}

export function resultOf(
  session: Pick<BrushingSession, 'durationS' | 'routineS' | 'complete'>,
): Result {
  if (session.complete) {
    return { word: 'Full', tone: 'positive' };
  }
  return { word: `Short by ${clockText(session.routineS - session.durationS)}`, tone: 'warning' };
}

export function sessionLine(session: BrushingSession): string {
  return `${clockText(session.durationS)} of ${clockText(session.routineS)}`;
}

export interface Group {
  readonly day: string;
  readonly label: string;
  readonly sessions: readonly BrushingSession[];
}

export function groupSessions(
  sessions: readonly BrushingSession[],
  today: string,
): readonly Group[] {
  const groups: { day: string; sessions: BrushingSession[] }[] = [];
  for (const session of sessions) {
    const day = dayOfSession(session);
    const last = groups.at(-1);
    if (last?.day === day) {
      last.sessions.push(session);
    } else {
      groups.push({ day, sessions: [session] });
    }
  }
  return groups.map((group) => ({ ...group, label: dayLabel(group.day, today) }));
}

export interface PressureRun {
  readonly pressure: BrushPressure;
  readonly seconds: number;
}

const CODES: readonly BrushPressure[] = ['no_contact', 'optimal', 'too_high'];

export function pressureRuns(strip: readonly (0 | 1 | 2)[]): readonly PressureRun[] {
  const runs: { pressure: BrushPressure; seconds: number }[] = [];
  for (const code of strip) {
    const pressure = CODES[code] ?? 'no_contact';
    const last = runs.at(-1);
    if (last?.pressure === pressure) {
      last.seconds += 1;
    } else {
      runs.push({ pressure, seconds: 1 });
    }
  }
  return runs;
}

export function zoneSourceOf(session: BrushingSession): ZoneSource {
  return session.details?.zoneSource ?? 'estimated';
}

export interface PacedZones {
  readonly reached: readonly number[];
  readonly missed: readonly number[];
}

export function pacedZones(session: BrushingSession, profile: BrushProfile): PacedZones {
  const target = session.routineS / Math.max(1, profile.zones);
  const zones = Array.from({ length: profile.zones }, (_, index) => index + 1);
  const done = (zone: number): boolean => (session.zones[zone - 1] ?? 0) >= target;
  return { reached: zones.filter(done), missed: zones.filter((zone) => !done(zone)) };
}

export interface Recap {
  readonly source: ZoneSource;
  readonly zonesShown: boolean;
  readonly reached: readonly string[];
  readonly missed: readonly string[];
  readonly short: string | null;
  readonly excess: string | null;
  readonly runs: readonly PressureRun[];
  readonly estimated: boolean;
}

interface ZoneSplit {
  readonly reached: readonly number[];
  readonly missed: readonly number[];
  readonly estimated: boolean;
}

function zoneSplit(session: BrushingSession, profile: BrushProfile, source: ZoneSource): ZoneSplit {
  const { mode } = session;
  if (source === 'pacer') {
    return { ...pacedZones(session, profile), estimated: false };
  }
  if (mode === null) {
    return { reached: [], missed: [], estimated: false };
  }
  const { zones } = profile;
  return {
    reached: zonesReached(mode, zones, session.durationS, session.routineS),
    missed: zonesMissed(mode, zones, session.durationS, session.routineS),
    estimated: stepsOf(mode, zones).length > 0,
  };
}

export function recapOf(session: BrushingSession, profile: BrushProfile): Recap {
  const names = zoneNamesOf(profile.zones);
  const source = zoneSourceOf(session);
  const split = zoneSplit(session, profile, source);
  const named = (zones: readonly number[]): string[] =>
    zones.flatMap((zone) => names[zone - 1] ?? []);
  const excess = session.pressure === null ? null : excessText(session.pressure.excessS);
  return {
    source,
    zonesShown: split.estimated || (source === 'pacer' && session.zones.length > 0),
    reached: named(split.reached),
    missed: named(split.missed),
    short: session.complete ? null : secondsText(session.routineS - session.durationS),
    excess,
    runs: session.pressure === null ? [] : pressureRuns(session.pressure.strip),
    estimated: split.estimated,
  };
}

export function excessText(seconds: number): string {
  return seconds === 0 ? 'No time pressing too hard' : `${secondsText(seconds)} pressing too hard`;
}

export function hasExcess(session: BrushingSession): boolean {
  return session.pressure?.strip.includes(PRESSURE_CODE_TOO_HIGH) === true;
}

export interface PlacedRun {
  readonly run: PressureRun;
  readonly x: number;
  readonly width: number;
}

const MIN_RUN_PX = 1.5;

export function placeRuns(
  runs: readonly PressureRun[],
  seconds: number,
  width: number,
): readonly PlacedRun[] {
  const total = Math.max(1, seconds);
  return runs.map((run, index) => {
    const before = runs.slice(0, index).reduce((sum, earlier) => sum + earlier.seconds, 0);
    return {
      run,
      x: (before / total) * width,
      width: Math.max(MIN_RUN_PX, (run.seconds / total) * width),
    };
  });
}

export function hardSecondsOf(runs: readonly PressureRun[]): number {
  return runs
    .filter((run) => run.pressure === 'too_high')
    .reduce((sum, run) => sum + run.seconds, 0);
}
