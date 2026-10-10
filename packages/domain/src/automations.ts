import { z } from 'zod';
import { CAPABILITY_KEY, type CapabilityKey } from './capabilities';
import { EVENT_KINDS, type EventKind } from './events';
import { COMPARISON, VALUE_COMPARISON, compare } from './comparison';
import { SUN_EVENTS, nextSunEvent, type GeoPoint } from './sun';
import { TOOL_ACTION, WAKE_AI_ACTION } from './automation-ai';
import { SIGNAL_TRIGGER } from './signals';
import { JSON_VALUE, type JsonValue } from './values';
import type { WeatherForecast } from './weather/forecast';
import {
  WEATHER_CONDITIONS,
  WEATHER_TRIGGERS,
  weatherConditionHolds,
  weatherTriggerFires,
} from './weather/rules';
import { localClock, minuteOfClock, shiftedDate, zonedInstant } from './zoned-clock';

const MINUTE_MS = 60_000;
const WEEK_DAYS = 8;
const DAY_MINUTES = 1440;

export const CLOCK_TIME = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'a time written as HH:MM');

export const WEEKDAYS = z
  .array(z.number().int().min(0).max(6))
  .min(1)
  .refine((days) => new Set(days).size === days.length, { message: 'weekdays must not repeat' });

export const TIME_ZONE = z
  .string()
  .refine((zone) => zone === 'UTC' || Intl.supportedValuesOf('timeZone').includes(zone), {
    message: 'not an IANA time zone',
  });

export const TRIGGER = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('state'),
    deviceId: z.uuid(),
    capability: CAPABILITY_KEY,
    comparison: COMPARISON,
  }),
  z.object({ type: z.literal('event'), deviceId: z.uuid().nullable(), kind: z.enum(EVENT_KINDS) }),
  z.object({ type: z.literal('time'), at: CLOCK_TIME, weekdays: WEEKDAYS }),
  z.object({
    type: z.literal('sun'),
    event: z.enum(SUN_EVENTS),
    offsetMinutes: z.number().int().min(-720).max(720),
  }),
  z.object({ type: z.literal('interval'), everyMinutes: z.number().int().min(1).max(10_080) }),
  ...WEATHER_TRIGGERS,
  SIGNAL_TRIGGER,
]);

export type Trigger = z.infer<typeof TRIGGER>;

export type TimedTrigger = Extract<Trigger, { type: 'time' | 'sun' | 'interval' }>;

export const CONDITION = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('state'),
    deviceId: z.uuid(),
    capability: CAPABILITY_KEY,
    comparison: VALUE_COMPARISON,
  }),
  z
    .object({ type: z.literal('time_window'), after: CLOCK_TIME, before: CLOCK_TIME })
    .refine((window) => window.after !== window.before, {
      message: 'a time window must not start and end at the same time',
    }),
  z.object({ type: z.literal('weekday'), weekdays: WEEKDAYS }),
  ...WEATHER_CONDITIONS,
]);

export type Condition = z.infer<typeof CONDITION>;

export const CONDITIONS = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('all'), items: z.array(CONDITION) }),
  z.object({ mode: z.literal('any'), items: z.array(CONDITION).min(1) }),
]);

export type Conditions = z.infer<typeof CONDITIONS>;

export const COMMAND_ACTION = z.object({
  type: z.literal('command'),
  deviceId: z.uuid(),
  capability: CAPABILITY_KEY,
  value: JSON_VALUE,
});

export type CommandAction = z.infer<typeof COMMAND_ACTION>;

export const ACTION = z.discriminatedUnion('type', [
  COMMAND_ACTION,
  z.object({ type: z.literal('scene'), sceneId: z.uuid() }),
  z.object({ type: z.literal('delay'), seconds: z.number().int().min(1).max(86_400) }),
  z.object({ type: z.literal('notify'), message: z.string().min(1).max(500) }),
  WAKE_AI_ACTION,
  TOOL_ACTION,
]);

export type Action = z.infer<typeof ACTION>;

export const SCENE_ACTIONS = z.array(COMMAND_ACTION);

export const AUTOMATION_DEFINITION = z.object({
  triggers: z.array(TRIGGER).min(1),
  conditions: CONDITIONS,
  actions: z.array(ACTION).min(1),
});

export type AutomationDefinition = z.infer<typeof AUTOMATION_DEFINITION>;

export interface StateChange {
  readonly deviceId: string;
  readonly capability: CapabilityKey;
  readonly value: JsonValue;
  readonly previous: JsonValue | undefined;
}

export function stateTriggerFires(trigger: Trigger, change: StateChange): boolean {
  if (
    trigger.type !== 'state' ||
    trigger.deviceId !== change.deviceId ||
    trigger.capability !== change.capability
  ) {
    return false;
  }
  if (trigger.comparison.operator === 'changed') {
    return compare(trigger.comparison, change.value, change.previous);
  }
  return (
    compare(trigger.comparison, change.value, undefined) &&
    !compare(trigger.comparison, change.previous, undefined)
  );
}

export function weatherChangeFires(
  trigger: Trigger,
  previous: WeatherForecast | null,
  next: WeatherForecast,
): boolean {
  return (
    (trigger.type === 'weather' || trigger.type === 'weather_kind') &&
    weatherTriggerFires(trigger, previous, next)
  );
}

export interface OccurredEvent {
  readonly deviceId: string | null;
  readonly kind: EventKind;
}

export function eventTriggerFires(trigger: Trigger, event: OccurredEvent): boolean {
  return (
    trigger.type === 'event' &&
    trigger.kind === event.kind &&
    (trigger.deviceId === null || trigger.deviceId === event.deviceId)
  );
}

function nextTimeOfDay(
  trigger: Extract<Trigger, { type: 'time' }>,
  after: Date,
  timeZone: string,
): Date {
  const today = localClock(after, timeZone);
  const minute = minuteOfClock(trigger.at);
  return Array.from({ length: WEEK_DAYS }, (_, index) => shiftedDate(today, index))
    .filter((date) => trigger.weekdays.includes(date.weekday))
    .map((date) => zonedInstant(date, minute, timeZone))
    .filter((candidate) => candidate.getTime() > after.getTime())
    .reduce((earliest) => earliest);
}

export interface Place {
  readonly timeZone: string;
  readonly location: GeoPoint | null;
}

export class MissingLocationError extends Error {
  override readonly name = 'MissingLocationError';

  constructor() {
    super(
      'A sunrise or sunset trigger needs the home latitude and longitude; the home has none set.',
    );
  }
}

export function nextOccurrence(trigger: TimedTrigger, after: Date, place: Place): Date | null {
  switch (trigger.type) {
    case 'interval':
      return new Date(after.getTime() + trigger.everyMinutes * MINUTE_MS);
    case 'time':
      return nextTimeOfDay(trigger, after, place.timeZone);
    case 'sun':
      if (place.location === null) {
        throw new MissingLocationError();
      }
      return nextSunEvent(
        { event: trigger.event, offsetMinutes: trigger.offsetMinutes, point: place.location },
        after,
      );
  }
}

export function isTimedTrigger(trigger: Trigger): trigger is TimedTrigger {
  return trigger.type === 'time' || trigger.type === 'sun' || trigger.type === 'interval';
}

export interface ConditionContext {
  readonly stateOf: (deviceId: string, capability: CapabilityKey) => JsonValue | undefined;
  readonly now: Date;
  readonly timeZone: string;
  readonly forecast: WeatherForecast | null;
  readonly location: GeoPoint | null;
}

function timeWindowHolds(
  condition: Extract<Condition, { type: 'time_window' }>,
  context: ConditionContext,
): boolean {
  const minute = localClock(context.now, context.timeZone).minuteOfDay;
  const start = minuteOfClock(condition.after);
  const length = (minuteOfClock(condition.before) - start + DAY_MINUTES) % DAY_MINUTES;
  return (minute - start + DAY_MINUTES) % DAY_MINUTES < length;
}

function conditionHolds(condition: Condition, context: ConditionContext): boolean {
  switch (condition.type) {
    case 'state':
      return compare(
        condition.comparison,
        context.stateOf(condition.deviceId, condition.capability),
        undefined,
      );
    case 'weekday':
      return condition.weekdays.includes(localClock(context.now, context.timeZone).weekday);
    case 'time_window':
      return timeWindowHolds(condition, context);
    case 'weather':
    case 'weather_kind':
    case 'daylight':
      return weatherConditionHolds(condition, context);
  }
}

export function conditionsHold(conditions: Conditions, context: ConditionContext): boolean {
  const holds = (condition: Condition): boolean => conditionHolds(condition, context);
  return conditions.mode === 'all' ? conditions.items.every(holds) : conditions.items.some(holds);
}
