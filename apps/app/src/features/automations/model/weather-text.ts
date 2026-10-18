import { z } from 'zod';
import {
  WEATHER_KINDS,
  WEATHER_KIND_LABELS,
  WEATHER_METRIC_INFO,
  type JsonValue,
  type TestV2,
  type WeatherKind,
  type WeatherMetric,
} from '@smarteverything/domain';
import { decimal, withUnit } from '../../../format/number';
import { hoursMinutes } from '../../../format/time';

export type NumericTest = Extract<TestV2, { is: 'gt' | 'gte' | 'lt' | 'lte' | 'between' }>;

type Operator = Exclude<NumericTest['is'], 'between'>;

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

export function weatherRuleText(metric: WeatherMetric, test: NumericTest, moving: boolean): string {
  const label = WEATHER_METRIC_INFO[metric].label.toLowerCase();
  if (test.is === 'between') {
    return `${label} ${moving ? 'moves between' : 'is between'} ${amount(metric, test.min)} and ${amount(metric, test.max)}`;
  }
  const words = moving ? RISING : STANDING;
  return `${label} ${words[test.is]} ${amount(metric, test.to)}`;
}

const WEATHER_KIND = z.enum(WEATHER_KINDS);

export function weatherKindsOf(values: readonly JsonValue[]): WeatherKind[] {
  return values.flatMap((value) => {
    const kind = WEATHER_KIND.safeParse(value);
    return kind.success ? [kind.data] : [];
  });
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

export interface Daylight {
  readonly daylight: 'day' | 'night';
  readonly sunriseOffset?: number | undefined;
  readonly sunsetOffset?: number | undefined;
}

export function daylightText(condition: Daylight): string {
  const start = offsetWords(condition.sunriseOffset ?? 0, 'sunrise');
  const end = offsetWords(condition.sunsetOffset ?? 0, 'sunset');
  return condition.daylight === 'day'
    ? `it is between ${start} and ${end}`
    : `it is between ${end} and ${start}`;
}
