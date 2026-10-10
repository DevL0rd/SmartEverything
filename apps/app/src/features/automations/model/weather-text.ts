import {
  WEATHER_KIND_LABELS,
  WEATHER_METRIC_INFO,
  type NumericComparison,
  type WeatherCondition,
  type WeatherKind,
  type WeatherMetric,
} from '@smarteverything/domain';
import { decimal, withUnit } from '../../../format/number';
import { hoursMinutes } from '../../../format/time';

type Operator = Exclude<NumericComparison['operator'], 'between'>;

const RISING: Readonly<Record<Operator, string>> = {
  gt: 'goes above',
  gte: 'reaches',
  lt: 'drops below',
  lte: 'drops to',
};

const STANDING: Readonly<Record<Operator, string>> = {
  gt: 'is above',
  gte: 'is at least',
  lt: 'is below',
  lte: 'is at most',
};

function amount(metric: WeatherMetric, value: number): string {
  return withUnit(
    decimal(value, metric === 'precipitation' ? 1 : 0),
    WEATHER_METRIC_INFO[metric].unit,
  );
}

export function weatherRuleText(
  metric: WeatherMetric,
  comparison: NumericComparison,
  moving: boolean,
): string {
  const label = WEATHER_METRIC_INFO[metric].label.toLowerCase();
  if (comparison.operator === 'between') {
    return `${label} ${moving ? 'moves between' : 'is between'} ${amount(metric, comparison.min)} and ${amount(metric, comparison.max)}`;
  }
  const words = moving ? RISING : STANDING;
  return `${label} ${words[comparison.operator]} ${amount(metric, comparison.value)}`;
}

function kindList(kinds: readonly WeatherKind[]): string {
  return kinds.map((kind) => WEATHER_KIND_LABELS[kind].toLowerCase()).join(' or ');
}

export function weatherKindText(kinds: readonly WeatherKind[], moving: boolean): string {
  return moving ? `the weather turns to ${kindList(kinds)}` : `the weather is ${kindList(kinds)}`;
}

function offsetWords(minutes: number, event: string): string {
  if (minutes === 0) {
    return event;
  }
  const span = hoursMinutes(Math.abs(minutes));
  return minutes < 0 ? `${span} before ${event}` : `${span} after ${event}`;
}

export function daylightText(condition: Extract<WeatherCondition, { type: 'daylight' }>): string {
  const start = offsetWords(condition.sunriseOffsetMinutes, 'sunrise');
  const end = offsetWords(condition.sunsetOffsetMinutes, 'sunset');
  return condition.is === 'day'
    ? `it is between ${start} and ${end}`
    : `it is between ${end} and ${start}`;
}
