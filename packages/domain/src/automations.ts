import {
  AutomationBindingError,
  resolveAutomationInput,
  type AutomationBindingContext,
} from './automation-bindings';
import {
  CLOCK_TIME,
  WEEKDAYS,
  CONDITIONS,
  LEGACY_CONDITIONS,
  type Condition,
  type Conditions,
} from './automation-conditions';
export { CLOCK_TIME, WEEKDAYS, CONDITION, CONDITIONS } from './automation-conditions';
export type { Condition, Conditions, LegacyCondition } from './automation-conditions';
import { z } from 'zod';
import { AUTOMATION_RUN_POLICY } from './automation-runs';
import { CAPABILITY_KEY, type CapabilityKey } from './capabilities';
import { EVENT_KINDS, type EventKind } from './events';
import { COMPARISON, compare } from './comparison';
import { SUN_EVENTS, nextSunEvent, type GeoPoint } from './sun';
import { ACTION, COMMAND_ACTION, LEGACY_ACTION, validateActionTree } from './automation-actions';
import { PLUGIN_ORIGIN } from './plugin-people';
import { SIGNAL_TRIGGER } from './signals';
import { SPEECH_TRIGGER } from './speech-triggers';
import {
  signalTriggerError,
  type SignalSourceSpec,
  type SignalTriggerError,
} from './signal-sources/index';
import { type JsonValue } from './values';
import type { WeatherForecast } from './weather/forecast';
import { WEATHER_TRIGGERS, weatherConditionHolds, weatherTriggerFires } from './weather/rules';
import { localClock, minuteOfClock, shiftedDate, zonedInstant } from './zoned-clock';

const MINUTE_MS = 60_000;
const WEEK_DAYS = 8;
const DAY_MINUTES = 1440;

function isIanaZone(zone: string): boolean {
  if (zone === 'UTC') {
    return true;
  }
  if (!zone.includes('/')) {
    return false;
  }
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: zone }).resolvedOptions().timeZone === zone;
  } catch (error) {
    if (error instanceof RangeError) {
      return false;
    }
    throw error;
  }
}

export const TIME_ZONE = z.string().refine(isIanaZone, { message: 'not an IANA time zone' });

const TRIGGER_CONTENT = z.discriminatedUnion('type', [
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
  SPEECH_TRIGGER,
]);

export const TRIGGER = TRIGGER_CONTENT.and(
  z.object({ nodeId: z.uuid().brand<'AutomationNodeId'>().optional() }),
);
export type Trigger = z.infer<typeof TRIGGER>;

export type TimedTrigger = Extract<Trigger, { type: 'time' | 'sun' | 'interval' }>;

export { ACTION, COMMAND_ACTION } from './automation-actions';
export type { Action, CommandAction, LegacyAction } from './automation-actions';

export const SCENE_ACTIONS = z.array(COMMAND_ACTION);

export const AUTOMATION_DEFINITION = z
  .object({
    triggers: z.array(TRIGGER).min(1),
    conditions: CONDITIONS,
    actions: z.array(ACTION).min(1),
    origin: PLUGIN_ORIGIN.nullable().default(null),
    runPolicy: AUTOMATION_RUN_POLICY.optional(),
    controlKey: z.string().trim().min(1).max(100).optional(),
  })
  .superRefine((definition, context) => {
    validateActionTree(
      definition.actions,
      context,
      definition.triggers.map((trigger) => trigger.nodeId),
    );
  });

export const LEGACY_AUTOMATION_DEFINITION = AUTOMATION_DEFINITION.safeExtend({
  actions: z.array(LEGACY_ACTION).min(1),
  conditions: LEGACY_CONDITIONS,
});
export type LegacyAutomationDefinition = z.infer<typeof LEGACY_AUTOMATION_DEFINITION>;
export type AutomationDefinition = z.infer<typeof AUTOMATION_DEFINITION>;

export function automationSignalError(
  sources: readonly SignalSourceSpec[],
  definition: Pick<AutomationDefinition, 'triggers'>,
): SignalTriggerError | null {
  for (const trigger of definition.triggers) {
    const error = trigger.type === 'signal' ? signalTriggerError(sources, trigger) : null;
    if (error !== null) {
      return error;
    }
  }
  return null;
}

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
  readonly bindings?: AutomationBindingContext;
  readonly valueOf?: (id: string) => JsonValue;
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
    case 'binding':
    case 'value':
      return valueConditionHolds(condition, context);
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

function valueConditionHolds(
  condition: Extract<Condition, { type: 'binding' | 'value' }>,
  context: ConditionContext,
): boolean {
  if (condition.type === 'binding') {
    if (context.bindings === undefined)
      throw new AutomationBindingError('Condition binding reader is unavailable');
    return compare(
      condition.comparison,
      resolveAutomationInput(condition.input, context.bindings),
      undefined,
    );
  }
  if (context.valueOf === undefined)
    throw new AutomationBindingError('Value condition reader is unavailable');
  return compare(condition.comparison, context.valueOf(condition.valueId), undefined);
}
