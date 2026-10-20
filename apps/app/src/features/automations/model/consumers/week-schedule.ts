import {
  nextOccurrence,
  type AutomationV3,
  type Place,
  type TimedTrigger,
} from '@smarteverything/domain';
import { MINUTE_MS } from '../../../../format/time';
import { activeTriggers, literalOf } from './row';

const MOST_IN_WINDOW = 300;
const EVERY_DAY: readonly number[] = [0, 1, 2, 3, 4, 5, 6];
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface Window {
  readonly start: Date;
  readonly end: Date;
}

export interface Upcoming {
  readonly key: string;
  readonly automationId: string;
  readonly name: string;
  readonly at: Date;
}

export interface ScheduledV3 {
  readonly program: AutomationV3;
  readonly enabled: boolean;
  readonly lastRunAt: string | null;
}

function minutesOf(ms: unknown): number | null {
  return typeof ms === 'number' && Number.isFinite(ms) ? Math.round(ms / MINUTE_MS) : null;
}

function weekdaysOf(days: unknown): readonly number[] {
  const listed = Array.isArray(days)
    ? days.filter((day): day is number => typeof day === 'number')
    : [];
  return listed.length === 0 ? EVERY_DAY : listed;
}

type Ports = AutomationV3['triggers'][number]['ports'];

function clockTrigger(ports: Ports): TimedTrigger | null {
  const at = literalOf(ports, 'at');
  return typeof at === 'string' && CLOCK.test(at)
    ? { type: 'time', at, weekdays: [...weekdaysOf(literalOf(ports, 'days'))] }
    : null;
}

function intervalTrigger(ports: Ports): TimedTrigger | null {
  const every = minutesOf(literalOf(ports, 'every'));
  return every !== null && every >= 1 ? { type: 'interval', everyMinutes: every } : null;
}

function sunTrigger(ports: Ports): TimedTrigger | null {
  const event = literalOf(ports, 'event');
  const offset = minutesOf(literalOf(ports, 'offset') ?? 0);
  return (event === 'sunrise' || event === 'sunset') && offset !== null
    ? { type: 'sun', event, offsetMinutes: offset }
    : null;
}

function timedOf(trigger: AutomationV3['triggers'][number]): TimedTrigger | null {
  switch (trigger.kind) {
    case 'trigger.time':
      return clockTrigger(trigger.ports);
    case 'trigger.interval':
      return intervalTrigger(trigger.ports);
    case 'trigger.sun':
      return sunTrigger(trigger.ports);
    default:
      return null;
  }
}

export function timedTriggersOf(program: AutomationV3): readonly TimedTrigger[] {
  return activeTriggers(program).flatMap((trigger) => {
    const timed = timedOf(trigger);
    return timed === null ? [] : [timed];
  });
}

function intervalTimes(everyMinutes: number, lastRunAt: string | null, window: Window): Date[] {
  if (lastRunAt === null) return [];
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
  if (trigger.type === 'sun' && place.location === null) return [];
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

const OCCURRENCES = new WeakMap<AutomationV3, CachedOccurrences>();

function signatureOf(scheduled: ScheduledV3, window: Window, place: Place): string {
  const { location } = place;
  return [
    scheduled.lastRunAt,
    window.start.getTime(),
    window.end.getTime(),
    place.timeZone,
    location === null ? null : `${String(location.latitude)},${String(location.longitude)}`,
  ].join('|');
}

function computeOccurrences(scheduled: ScheduledV3, window: Window, place: Place): Date[] {
  return timedTriggersOf(scheduled.program)
    .flatMap((trigger) =>
      trigger.type === 'interval'
        ? intervalTimes(trigger.everyMinutes, scheduled.lastRunAt, window)
        : clockTimes(trigger, window, place),
    )
    .sort((left, right) => left.getTime() - right.getTime());
}

function occurrencesIn(scheduled: ScheduledV3, window: Window, place: Place): readonly Date[] {
  if (!scheduled.enabled) return [];
  const signature = signatureOf(scheduled, window, place);
  const cached = OCCURRENCES.get(scheduled.program);
  if (cached?.signature === signature) return cached.times;
  const times = computeOccurrences(scheduled, window, place);
  OCCURRENCES.set(scheduled.program, { signature, times });
  return times;
}

export function upcomingRuns(
  rules: readonly {
    readonly id: string;
    readonly name: string;
    readonly scheduled: ScheduledV3 | null;
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
