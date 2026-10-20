import { z } from 'zod';
import { BRUSH_INTENSITIES, BRUSH_MODES, ZONE_SOURCES } from './toothbrush';
import { sessionDayOf, sessionHourOf } from './treadmill-days';

export const BRUSHING_SOURCES = ['retained', 'observed'] as const;

export type BrushingSource = (typeof BRUSHING_SOURCES)[number];

export const PRESSURE_STRIP_MAX = 400;

export const PRESSURE_CODE_NONE = 0;

export const PRESSURE_CODE_OPTIMAL = 1;

export const PRESSURE_CODE_TOO_HIGH = 2;

export interface BrushSessionRules {
  readonly mergeWindowS: number;
  readonly pauseGraceS: number;
  readonly catchLimitS: number;
  readonly silenceS: number;
}

export const SONICARE_RULES: BrushSessionRules = {
  mergeWindowS: 5,
  pauseGraceS: 0,
  catchLimitS: 3,
  silenceS: 0,
};

export const ORALB_RULES: BrushSessionRules = {
  mergeWindowS: 120,
  pauseGraceS: 20,
  catchLimitS: 3,
  silenceS: 30,
};

export const MIN_BRUSHING_SECONDS = 10;

export const SESSION_PRESSURE = z.strictObject({
  excessS: z.number().nonnegative(),
  optimalS: z.number().nonnegative(),
  strip: z.array(z.union([z.literal(0), z.literal(1), z.literal(2)])).max(PRESSURE_STRIP_MAX),
  lowS: z.number().nonnegative().optional(),
  highEvents: z.number().int().nonnegative().optional(),
  lowEvents: z.number().int().nonnegative().optional(),
  forceAvgN: z.number().nonnegative().optional(),
  forceMaxN: z.number().nonnegative().optional(),
});

export type SessionPressure = z.infer<typeof SESSION_PRESSURE>;

export const SESSION_DETAILS = z.strictObject({
  zoneSource: z.enum(ZONE_SOURCES),
  face: z.number().int().min(0).max(11).nullable(),
  batteryEnd: z.number().min(0).max(100).nullable(),
  handleUser: z.number().int().min(0).max(7).nullable(),
  sectors: z.number().int().min(0).max(8).nullable(),
});

export type SessionDetails = z.infer<typeof SESSION_DETAILS>;

export const BRUSHING_SESSION = z.strictObject({
  id: z.string().min(1),
  deviceId: z.string().min(1),
  personId: z.string().min(1).nullable(),
  handleSessionId: z.number().int().nonnegative().nullable(),
  startedAt: z.iso.datetime({ offset: true }),
  zoneOffsetSeconds: z.number().int(),
  durationS: z.number().nonnegative(),
  routineS: z.number().positive(),
  mode: z.enum(BRUSH_MODES).nullable(),
  intensity: z.enum(BRUSH_INTENSITIES).nullable(),
  source: z.enum(BRUSHING_SOURCES),
  complete: z.boolean(),
  pressure: SESSION_PRESSURE.nullable(),
  zones: z.array(z.number().nonnegative()),
  headSerial: z.string().nullable(),
  details: SESSION_DETAILS.nullable().default(null),
});

export type BrushingSession = z.infer<typeof BRUSHING_SESSION>;

const HOUR = z.number().int().min(0).max(23);

export const BRUSHING_GOAL = z.strictObject({
  sessionsPerDay: z.number().int().min(1).max(6).default(2),
  minimumSeconds: z.number().int().positive().nullable().default(null),
  morningFromHour: HOUR.default(4),
  morningToHour: HOUR.default(12),
  eveningFromHour: HOUR.default(17),
  eveningToHour: HOUR.default(3),
});

export type BrushingGoal = z.infer<typeof BRUSHING_GOAL>;

export const DEFAULT_GOAL: BrushingGoal = BRUSHING_GOAL.parse({});

export type DayPart = 'morning' | 'evening' | 'other';

export function isComplete(durationS: number, routineS: number): boolean {
  return durationS >= routineS;
}

export function worthKeeping(durationS: number): boolean {
  return durationS >= MIN_BRUSHING_SECONDS;
}

export function sameSession(
  retained: Pick<BrushingSession, 'startedAt' | 'handleSessionId'>,
  observed: Pick<BrushingSession, 'startedAt'>,
  rules: BrushSessionRules,
): boolean {
  const gap = Math.abs(Date.parse(retained.startedAt) - Date.parse(observed.startedAt)) / 1000;
  return gap <= rules.mergeWindowS;
}

export function localHourOf(
  session: Pick<BrushingSession, 'startedAt' | 'zoneOffsetSeconds'>,
): number {
  return Number(sessionHourOf(session.startedAt, session.zoneOffsetSeconds).slice(11, 13));
}

function inRange(hour: number, from: number, to: number): boolean {
  return from <= to ? hour >= from && hour < to : hour >= from || hour < to;
}

export function dayPartOf(goal: BrushingGoal, hour: number): DayPart {
  if (inRange(hour, goal.morningFromHour, goal.morningToHour)) {
    return 'morning';
  }
  return inRange(hour, goal.eveningFromHour, goal.eveningToHour) ? 'evening' : 'other';
}

export function goalDayOf(
  goal: BrushingGoal,
  session: Pick<BrushingSession, 'startedAt' | 'zoneOffsetSeconds'>,
): string {
  return sessionDayOf(session.startedAt, session.zoneOffsetSeconds - goal.eveningToHour * 3600);
}

export function countsForGoal(
  goal: BrushingGoal,
  session: Pick<BrushingSession, 'durationS' | 'routineS'>,
): boolean {
  return session.durationS >= (goal.minimumSeconds ?? session.routineS);
}

export interface TodayFacts {
  readonly day: string;
  readonly sessions: number;
  readonly counted: number;
  readonly goalSessions: number;
  readonly seconds: number;
  readonly goalSeconds: number;
  readonly morning: boolean;
  readonly evening: boolean;
  readonly percent: number;
}

export function todayOf(
  sessions: readonly BrushingSession[],
  goal: BrushingGoal,
  day: string,
): TodayFacts {
  const mine = sessions.filter((session) => goalDayOf(goal, session) === day);
  const counted = mine.filter((session) => countsForGoal(goal, session));
  const parts = new Set(counted.map((session) => dayPartOf(goal, localHourOf(session))));
  const seconds = mine.reduce((sum, session) => sum + session.durationS, 0);
  const routine = mine.at(0)?.routineS ?? 120;
  const goalSeconds = goal.sessionsPerDay * (goal.minimumSeconds ?? routine);
  const percent = Math.min(100, Math.round((counted.length / goal.sessionsPerDay) * 100));
  return {
    day,
    sessions: mine.length,
    counted: counted.length,
    goalSessions: goal.sessionsPerDay,
    seconds,
    goalSeconds,
    morning: parts.has('morning'),
    evening: parts.has('evening'),
    percent,
  };
}
