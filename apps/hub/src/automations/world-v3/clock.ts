import { CLOCK_TIME, localClock, minuteOfClock, zonedInstant } from '@smarteverything/domain';
import { z } from 'zod';
import { parseInputs } from './inputs';
import { outputsOf, type ReadHandlers, type ReadResult } from './read-port';
import { homeZone } from './zone';
import type { WorldReadDeps } from './deps';

const DAY_CHOICES = ['today', 'tomorrow', 'next'] as const;

const TODAY_AT = z.object({ clock: CLOCK_TIME, day: z.enum(DAY_CHOICES) });

const SINCE = z.object({ instant: z.iso.datetime({ offset: true }), until: z.boolean() });

function dayAfter(date: ReturnType<typeof localClock>): {
  year: number;
  month: number;
  day: number;
} {
  const next = new Date(Date.UTC(date.year, date.month - 1, date.day + 1));
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
}

function todayAt(now: Date, zone: string, clock: string, day: (typeof DAY_CHOICES)[number]): Date {
  const local = localClock(now, zone);
  const minute = minuteOfClock(clock);
  const today = zonedInstant(local, minute, zone);
  if (day === 'today') return today;
  const tomorrow = zonedInstant(dayAfter(local), minute, zone);
  return day === 'tomorrow' || today.getTime() <= now.getTime() ? tomorrow : today;
}

export function clockHandlers(deps: WorldReadDeps): ReadHandlers {
  return {
    'date.now': (): ReadResult => outputsOf({ at: deps.clock.now().toISOString() }),
    'date.today_at': (inputs): ReadResult => {
      const request = parseInputs('date.today_at', TODAY_AT, inputs);
      const at = todayAt(deps.clock.now(), homeZone(deps.store), request.clock, request.day);
      return outputsOf({ at: at.toISOString() });
    },
    'date.since': (inputs): ReadResult => {
      const request = parseInputs('date.since', SINCE, inputs);
      const moment = Date.parse(request.instant);
      const now = deps.clock.now().getTime();
      return outputsOf({ duration: Math.max(0, request.until ? moment - now : now - moment) });
    },
  };
}
