import {
  GEO_POINT,
  TIME_ZONE,
  localClock,
  nextOccurrence,
  timedTriggerOf,
  zonedInstant,
  type AutomationV2,
  type CalendarDate,
  type Place,
  type TimedTrigger,
} from '@smarteverything/domain';
import { MINUTE_MS } from '../../../format/time';

const MOST_IN_WINDOW = 300;

export interface HomePlace {
  readonly time_zone: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
}

export type PlaceReading =
  | { readonly usable: true; readonly place: Place }
  | { readonly usable: false; readonly problem: string };

export function placeOf(home: HomePlace): PlaceReading {
  if (!TIME_ZONE.safeParse(home.time_zone).success) {
    return { usable: false, problem: 'Your home’s time zone isn’t valid.' };
  }
  const location = GEO_POINT.safeParse({ latitude: home.latitude, longitude: home.longitude });
  return {
    usable: true,
    place: { timeZone: home.time_zone, location: location.success ? location.data : null },
  };
}

export interface Scheduled {
  readonly automation: AutomationV2;
  readonly enabled: boolean;
  readonly lastRunAt: string | null;
}

export interface Window {
  readonly start: Date;
  readonly end: Date;
}

function dateAfter(date: CalendarDate, days: number): CalendarDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

export function dayWindow(now: Date, timeZone: string, offsetDays: number, days = 1): Window {
  const today = localClock(now, timeZone);
  return {
    start: zonedInstant(dateAfter(today, offsetDays), 0, timeZone),
    end: zonedInstant(dateAfter(today, offsetDays + days), 0, timeZone),
  };
}

function intervalTimes(everyMinutes: number, lastRunAt: string | null, window: Window): Date[] {
  if (lastRunAt === null) {
    return [];
  }
  const every = everyMinutes * MINUTE_MS;
  const last = Date.parse(lastRunAt);
  const first = last + Math.ceil((window.start.getTime() - last) / every) * every;
  const times: Date[] = [];
  for (let at = first; at < window.end.getTime() && times.length < MOST_IN_WINDOW; at += every) {
    times.push(new Date(at));
  }
  return times;
}

function clockTimes(trigger: TimedTrigger, window: Window, place: Place): Date[] {
  if (trigger.type === 'sun' && place.location === null) {
    return [];
  }
  const times: Date[] = [];
  let next = nextOccurrence(trigger, new Date(window.start.getTime() - 1), place);
  while (next !== null && next < window.end && times.length < MOST_IN_WINDOW) {
    times.push(next);
    next = nextOccurrence(trigger, next, place);
  }
  return times;
}

interface CachedOccurrences {
  readonly signature: string;
  readonly times: readonly Date[];
}

const OCCURRENCES = new WeakMap<AutomationV2, CachedOccurrences>();

function signatureOf(scheduled: Scheduled, window: Window, place: Place): string {
  const { location } = place;
  return [
    scheduled.enabled,
    scheduled.lastRunAt,
    window.start.getTime(),
    window.end.getTime(),
    place.timeZone,
    location === null ? null : `${String(location.latitude)},${String(location.longitude)}`,
  ].join('|');
}

function computeOccurrences(scheduled: Scheduled, window: Window, place: Place): Date[] {
  return scheduled.automation.when
    .flatMap((trigger) => {
      const timed = timedTriggerOf(trigger);
      return timed === null ? [] : [timed];
    })
    .flatMap((trigger) =>
      trigger.type === 'interval'
        ? intervalTimes(trigger.everyMinutes, scheduled.lastRunAt, window)
        : clockTimes(trigger, window, place),
    )
    .sort((left, right) => left.getTime() - right.getTime());
}

function occurrencesIn(scheduled: Scheduled, window: Window, place: Place): readonly Date[] {
  if (!scheduled.enabled) {
    return [];
  }
  const signature = signatureOf(scheduled, window, place);
  const cached = OCCURRENCES.get(scheduled.automation);
  if (cached?.signature === signature) {
    return cached.times;
  }
  const times = computeOccurrences(scheduled, window, place);
  OCCURRENCES.set(scheduled.automation, { signature, times });
  return times;
}

export interface Upcoming {
  readonly key: string;
  readonly automationId: string;
  readonly name: string;
  readonly at: Date;
}

export function upcomingRuns(
  rules: readonly {
    readonly id: string;
    readonly name: string;
    readonly scheduled: Scheduled | null;
  }[],
  window: Window,
  place: Place,
): Upcoming[] {
  return rules
    .flatMap((rule) =>
      rule.scheduled === null
        ? []
        : occurrencesIn(rule.scheduled, window, place).map((at) => ({
            key: `${rule.id}:${at.toISOString()}`,
            automationId: rule.id,
            name: rule.name,
            at,
          })),
    )
    .sort((left, right) => left.at.getTime() - right.at.getTime());
}
