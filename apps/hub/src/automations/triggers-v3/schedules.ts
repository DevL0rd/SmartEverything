import {
  CLOCK_TIME,
  MissingLocationError,
  SUN_MOMENTS,
  localClock,
  nextSunEvent,
  nextOccurrence,
  zonedInstant,
  type Place,
  type TimedTrigger,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { JsonValue } from '@smarteverything/domain';

const MINUTE_MS = 60_000;
const DAY_MINUTES = 1440;
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6] as const;

export interface Schedule {
  readonly next: (after: Date, place: Place) => Date | null;
  readonly extra: (tick: number, due: Date) => Readonly<Record<string, JsonValue>>;
}

export type Compiled<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

const TIME_PORTS = z.object({
  at: CLOCK_TIME,
  days: z.array(z.int().min(0).max(6)).optional(),
});

const INTERVAL_PORTS = z.object({
  every: z.int().min(MINUTE_MS),
  alignToClock: z.boolean().default(false),
});

const SUN_PORTS = z.object({
  event: z.enum(SUN_MOMENTS),
  offset: z.int().min(-43_200_000).max(43_200_000).default(0),
  elevation: z.number().min(-18).max(90).optional(),
});

const SCHEDULE_BLOCK = z.object({
  at: CLOCK_TIME,
  days: z.array(z.int().min(0).max(6)).optional(),
  slot: z.json().optional(),
});

const SCHEDULE_PORTS = z.object({
  blocks: z.array(SCHEDULE_BLOCK).min(1),
  except: z.array(z.iso.date()).default([]),
});

function nextDay(date: { year: number; month: number; day: number }): {
  year: number;
  month: number;
  day: number;
} {
  const moved = new Date(Date.UTC(date.year, date.month - 1, date.day + 1));
  return { year: moved.getUTCFullYear(), month: moved.getUTCMonth() + 1, day: moved.getUTCDate() };
}

function nextRoundTime(after: Date, everyMinutes: number, timeZone: string): Date {
  const local = localClock(after, timeZone);
  const minute = (Math.floor(local.minuteOfDay / everyMinutes) + 1) * everyMinutes;
  return minute < DAY_MINUTES
    ? zonedInstant(local, minute, timeZone)
    : zonedInstant(nextDay(local), 0, timeZone);
}

function viaDomain(trigger: TimedTrigger, extra: Schedule['extra']): Schedule {
  return { next: (after, place) => nextOccurrence(trigger, after, place), extra };
}

function invalid(error: z.ZodError): Compiled<never> {
  return { ok: false, error: error.issues.map((issue) => issue.message).join('; ') };
}

function timeSchedule(ports: unknown): Compiled<Schedule> {
  const parsed = TIME_PORTS.safeParse(ports);
  if (!parsed.success) return invalid(parsed.error);
  const weekdays =
    parsed.data.days === undefined || parsed.data.days.length === 0
      ? [...EVERY_DAY]
      : parsed.data.days;
  return {
    ok: true,
    value: viaDomain({ type: 'time', at: parsed.data.at, weekdays }, () => ({})),
  };
}

function intervalSchedule(ports: unknown): Compiled<Schedule> {
  const parsed = INTERVAL_PORTS.safeParse(ports);
  if (!parsed.success) return invalid(parsed.error);
  const { every, alignToClock } = parsed.data;
  if (every % MINUTE_MS !== 0)
    return { ok: false, error: 'The interval must be a whole number of minutes' };
  const everyMinutes = every / MINUTE_MS;
  const extra: Schedule['extra'] = (tick) => ({ tick });
  if (!alignToClock)
    return { ok: true, value: viaDomain({ type: 'interval', everyMinutes }, extra) };
  return {
    ok: true,
    value: { next: (after, place) => nextRoundTime(after, everyMinutes, place.timeZone), extra },
  };
}

function sunSchedule(ports: unknown): Compiled<Schedule> {
  const parsed = SUN_PORTS.safeParse(ports);
  if (!parsed.success) return invalid(parsed.error);
  const { event, offset, elevation } = parsed.data;
  const crossing = event === 'elevation_rising' || event === 'elevation_falling';
  if (crossing && elevation === undefined)
    return { ok: false, error: 'A height crossing needs the sun height' };
  const offsetMinutes = Math.round(offset / MINUTE_MS);
  return {
    ok: true,
    value: {
      next: (after: Date, place: Place): Date | null => {
        if (place.location === null) throw new MissingLocationError();
        return nextSunEvent(
          {
            event,
            offsetMinutes,
            point: place.location,
            ...(elevation !== undefined ? { elevation } : {}),
          },
          after,
        );
      },
      extra: () => ({ event }),
    },
  };
}

function localDateKey(instant: Date, timeZone: string): string {
  const local = localClock(instant, timeZone);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${String(local.year)}-${pad(local.month)}-${pad(local.day)}`;
}

export function scheduleSchedule(ports: unknown): Compiled<Schedule> {
  const parsed = SCHEDULE_PORTS.safeParse(ports);
  if (!parsed.success) return invalid(parsed.error);
  const skipped = new Set(parsed.data.except);
  const slots = new Map<number, JsonValue>();
  const blocks = parsed.data.blocks.map((block) => ({
    slot: block.slot ?? null,
    trigger: {
      type: 'time' as const,
      at: block.at,
      weekdays: block.days === undefined || block.days.length === 0 ? [...EVERY_DAY] : block.days,
    },
  }));
  const next: Schedule['next'] = (after, place) => {
    let cursor = after;
    for (let guard = 0; guard < 400; guard += 1) {
      const candidates = blocks
        .map((block) => ({ block, at: nextOccurrence(block.trigger, cursor, place) }))
        .flatMap((entry) => (entry.at === null ? [] : [{ block: entry.block, at: entry.at }]))
        .sort((left, right) => left.at.getTime() - right.at.getTime());
      const first = candidates[0];
      if (first === undefined) return null;
      if (!skipped.has(localDateKey(first.at, place.timeZone))) {
        slots.set(first.at.getTime(), first.block.slot);
        return first.at;
      }
      cursor = first.at;
    }
    return null;
  };
  return {
    ok: true,
    value: { next, extra: (_tick, due) => ({ slot: slots.get(due.getTime()) ?? null }) },
  };
}

export const TIMED_COMPILERS: Readonly<Record<string, (ports: unknown) => Compiled<Schedule>>> = {
  'trigger.time': timeSchedule,
  'trigger.interval': intervalSchedule,
  'trigger.sun': sunSchedule,
  'trigger.schedule': scheduleSchedule,
};
