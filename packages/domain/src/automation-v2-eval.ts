import { AutomationBindingError } from './automation-bindings';
import {
  type ConditionV2,
  type FromV2,
  type InputV2,
  type OperandV2,
  type TestV2,
  type TimeWindowV2,
  type ToV2,
  type TriggerV2,
} from './automation-v2-schema';
import type { TimedTrigger } from './automations';
import type { CapabilityKey } from './capabilities';
import { compare, jsonEquals } from './comparison';
import type { GeoPoint } from './sun';
import type { JsonValue } from './values';
import { weatherKindOf } from './weather/conditions';
import type { WeatherForecast } from './weather/forecast';
import { weatherConditionHolds, weatherMetricValue, type WeatherMetric } from './weather/rules';
import { localClock, minuteOfClock } from './zoned-clock';

const DAY_MINUTES = 1440;
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

export interface OperandReader {
  readonly device: (deviceId: string, control: CapabilityKey) => JsonValue | undefined;
  readonly value: (valueId: string) => JsonValue;
  readonly input: (name: string) => JsonValue;
}

export interface ContextV2 {
  readonly read: OperandReader;
  readonly now: Date;
  readonly timeZone: string;
  readonly forecast: WeatherForecast | null;
  readonly location: GeoPoint | null;
}

export function weatherReading(
  metric: WeatherMetric | 'kind',
  forecast: WeatherForecast | null,
): JsonValue | undefined {
  if (forecast === null) return undefined;
  return metric === 'kind'
    ? weatherKindOf(forecast.now.code)
    : (weatherMetricValue(forecast, metric) ?? undefined);
}

function readOperand(operand: OperandV2, context: ContextV2): JsonValue | undefined {
  if ('device' in operand) return context.read.device(operand.device, operand.control);
  if ('value' in operand) return context.read.value(operand.value);
  if ('input' in operand) return context.read.input(operand.input);
  if ('weather' in operand) return weatherReading(operand.weather, context.forecast);
  return operand.literal;
}

export function isFrom(subject: InputV2 | OperandV2 | ToV2): subject is FromV2 {
  return (
    typeof subject === 'object' && subject !== null && !Array.isArray(subject) && 'from' in subject
  );
}

function withinBounds(result: number, from: FromV2): boolean {
  return (
    (from.min === undefined || result >= from.min) && (from.max === undefined || result <= from.max)
  );
}

function readFrom(from: FromV2, context: ContextV2): JsonValue | undefined {
  const base = readOperand(from.from, context);
  if (
    base === undefined ||
    (from.add === undefined && from.min === undefined && from.max === undefined)
  )
    return base;
  if (typeof base !== 'number')
    throw new AutomationBindingError('numeric offsets and bounds need a number');
  const result = base + (from.add ?? 0);
  if (!withinBounds(result, from))
    throw new AutomationBindingError('the result exceeds the input bounds');
  return result;
}

export function resolveInputV2(input: InputV2, context: ContextV2): JsonValue {
  if (!isFrom(input)) return input;
  const value = readFrom(input, context);
  if (value === undefined) throw new AutomationBindingError('the input has no value');
  return value;
}

function isFields(to: ToV2): to is Record<string, InputV2> {
  return typeof to === 'object' && to !== null && !Array.isArray(to) && !('from' in to);
}

export function resolveToV2(to: ToV2, context: ContextV2): JsonValue {
  if (isFrom(to)) return resolveInputV2(to, context);
  if (!isFields(to)) return to;
  return Object.fromEntries(
    Object.entries(to).map(([field, input]) => [field, resolveInputV2(input, context)]),
  );
}

export function testHolds(test: TestV2, value: JsonValue | undefined): boolean {
  switch (test.is) {
    case 'in':
      return value !== undefined && test.to.some((entry) => jsonEquals(value, entry));
    case 'between':
      return compare({ operator: 'between', min: test.min, max: test.max }, value, undefined);
    case 'eq':
    case 'ne':
      return compare({ operator: test.is, value: test.to }, value, undefined);
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
      return compare({ operator: test.is, value: test.to }, value, undefined);
  }
}

function timeHolds(time: TimeWindowV2, context: ContextV2): boolean {
  const clock = localClock(context.now, context.timeZone);
  if (time.days !== undefined && !time.days.includes(clock.weekday)) return false;
  const after = time.after === undefined ? undefined : minuteOfClock(time.after);
  const before = time.before === undefined ? undefined : minuteOfClock(time.before);
  if (after !== undefined && before !== undefined)
    return (
      (clock.minuteOfDay - after + DAY_MINUTES) % DAY_MINUTES <
      (before - after + DAY_MINUTES) % DAY_MINUTES
    );
  return (
    (after === undefined || clock.minuteOfDay >= after) &&
    (before === undefined || clock.minuteOfDay < before)
  );
}

function compareHolds(
  condition: Extract<ConditionV2, { compare: unknown }>,
  context: ContextV2,
): boolean {
  const { compare: subject, test } = condition;
  return testHolds(
    test,
    isFrom(subject) ? readFrom(subject, context) : readOperand(subject, context),
  );
}

export function conditionV2Holds(condition: ConditionV2, context: ContextV2): boolean {
  if ('all' in condition) return condition.all.every((item) => conditionV2Holds(item, context));
  if ('any' in condition) return condition.any.some((item) => conditionV2Holds(item, context));
  if ('not' in condition) return !conditionV2Holds(condition.not, context);
  if ('compare' in condition) return compareHolds(condition, context);
  if ('time' in condition) return timeHolds(condition.time, context);
  return weatherConditionHolds(
    {
      type: 'daylight',
      is: condition.daylight,
      sunriseOffsetMinutes: condition.sunriseOffset ?? 0,
      sunsetOffsetMinutes: condition.sunsetOffset ?? 0,
    },
    context,
  );
}

export function timedTriggerOf(trigger: TriggerV2): TimedTrigger | null {
  if (trigger.on === 'time')
    return { type: 'time', at: trigger.at, weekdays: trigger.days ?? EVERY_DAY };
  if (trigger.on === 'sun')
    return { type: 'sun', event: trigger.event, offsetMinutes: trigger.offsetMinutes ?? 0 };
  return trigger.on === 'every' ? { type: 'interval', everyMinutes: trigger.minutes } : null;
}
