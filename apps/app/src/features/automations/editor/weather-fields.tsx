import {
  WEATHER_KINDS,
  WEATHER_KIND_LABELS,
  WEATHER_METRICS,
  WEATHER_METRIC_INFO,
  type LegacyCondition as Condition,
  type NumericComparison,
  type Trigger,
  type WeatherCondition,
  type WeatherKind,
  type WeatherMetric,
} from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Checkbox } from '../../../components/checkbox';
import { NumberStepper } from '../../../components/number-stepper';
import { Segmented } from '../../../components/segmented';
import { Select } from '../../../components/select';
import { OPERATOR_LABELS } from '../model/capability-choices';

const OPERATORS = ['gt', 'gte', 'lt', 'lte', 'between'] as const;

type Operator = (typeof OPERATORS)[number];

const METRIC_OPTIONS = WEATHER_METRICS.map((metric) => ({
  value: metric,
  label: WEATHER_METRIC_INFO[metric].label,
}));

const OPERATOR_OPTIONS = OPERATORS.map((operator) => ({
  value: operator,
  label: OPERATOR_LABELS[operator],
}));

function anchorOf(comparison: NumericComparison): number {
  return comparison.operator === 'between' ? comparison.min : comparison.value;
}

function withOperator(
  comparison: NumericComparison,
  operator: Operator,
  metric: WeatherMetric,
): NumericComparison {
  const value = anchorOf(comparison);
  if (operator === 'between') {
    const top = Math.min(
      value + WEATHER_METRIC_INFO[metric].step * 5,
      WEATHER_METRIC_INFO[metric].max,
    );
    return { operator, min: value, max: top };
  }
  return { operator, value };
}

function clamped(metric: WeatherMetric, value: number): number {
  const info = WEATHER_METRIC_INFO[metric];
  return Math.min(Math.max(value, info.min), info.max);
}

function Amount({
  metric,
  label,
  value,
  onChange,
}: {
  readonly metric: WeatherMetric;
  readonly label: string;
  readonly value: number;
  readonly onChange: (value: number) => void;
}): ReactNode {
  const info = WEATHER_METRIC_INFO[metric];
  return (
    <NumberStepper
      label={label}
      value={value}
      min={info.min}
      max={info.max}
      step={info.step}
      onChange={onChange}
      {...(info.unit === null ? {} : { unit: info.unit })}
    />
  );
}

function Values({
  metric,
  comparison,
  onChange,
}: {
  readonly metric: WeatherMetric;
  readonly comparison: NumericComparison;
  readonly onChange: (comparison: NumericComparison) => void;
}): ReactNode {
  if (comparison.operator !== 'between') {
    return (
      <Amount
        metric={metric}
        label="Value"
        value={comparison.value}
        onChange={(value) => {
          onChange({ ...comparison, value });
        }}
      />
    );
  }
  return (
    <View className="gap-3">
      <Amount
        metric={metric}
        label="From"
        value={comparison.min}
        onChange={(min) => {
          onChange({ ...comparison, min, max: Math.max(min, comparison.max) });
        }}
      />
      <Amount
        metric={metric}
        label="To"
        value={comparison.max}
        onChange={(max) => {
          onChange({ ...comparison, max, min: Math.min(max, comparison.min) });
        }}
      />
    </View>
  );
}

export interface WeatherRule {
  readonly metric: WeatherMetric;
  readonly comparison: NumericComparison;
}

export function WeatherRuleFields({
  rule,
  onChange,
}: {
  readonly rule: WeatherRule;
  readonly onChange: (rule: WeatherRule) => void;
}): ReactNode {
  return (
    <View className="gap-3">
      <Select
        label="Reading"
        value={rule.metric}
        options={METRIC_OPTIONS}
        onChange={(metric) => {
          const value = clamped(metric, anchorOf(rule.comparison));
          onChange({
            metric,
            comparison: withOperator({ operator: 'gt', value }, rule.comparison.operator, metric),
          });
        }}
      />
      <Select
        label="Compare"
        value={rule.comparison.operator}
        options={OPERATOR_OPTIONS}
        onChange={(operator) => {
          onChange({ ...rule, comparison: withOperator(rule.comparison, operator, rule.metric) });
        }}
      />
      <Values
        metric={rule.metric}
        comparison={rule.comparison}
        onChange={(comparison) => {
          onChange({ ...rule, comparison });
        }}
      />
    </View>
  );
}

export function WeatherKindFields({
  kinds,
  onChange,
}: {
  readonly kinds: readonly WeatherKind[];
  readonly onChange: (kinds: WeatherKind[]) => void;
}): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-x-6 gap-y-1">
      {WEATHER_KINDS.map((kind) => (
        <Checkbox
          key={kind}
          label={WEATHER_KIND_LABELS[kind]}
          checked={kinds.includes(kind)}
          onChange={(checked) => {
            const next = checked ? [...kinds, kind] : kinds.filter((item) => item !== kind);
            if (next.length > 0) {
              onChange(next);
            }
          }}
        />
      ))}
    </View>
  );
}

type Daylight = Extract<WeatherCondition, { type: 'daylight' }>;

export function DaylightFields({
  condition,
  onChange,
}: {
  readonly condition: Daylight;
  readonly onChange: (condition: Daylight) => void;
}): ReactNode {
  return (
    <View className="gap-3">
      <Segmented
        label="When"
        value={condition.is}
        options={[
          { value: 'day', label: 'Daytime', icon: 'sun' },
          { value: 'night', label: 'After dark', icon: 'moon' },
        ]}
        onChange={(is) => {
          onChange({ ...condition, is });
        }}
      />
      <NumberStepper
        label="Shift sunrise by"
        value={condition.sunriseOffsetMinutes}
        min={-180}
        max={180}
        step={15}
        unit="min"
        onChange={(sunriseOffsetMinutes) => {
          onChange({ ...condition, sunriseOffsetMinutes });
        }}
      />
      <NumberStepper
        label="Shift sunset by"
        value={condition.sunsetOffsetMinutes}
        min={-180}
        max={180}
        step={15}
        unit="min"
        onChange={(sunsetOffsetMinutes) => {
          onChange({ ...condition, sunsetOffsetMinutes });
        }}
      />
    </View>
  );
}

type WeatherTrigger = Extract<Trigger, { type: 'weather' | 'weather_kind' }>;

export function WeatherTriggerFields({
  trigger,
  onChange,
}: {
  readonly trigger: WeatherTrigger;
  readonly onChange: (trigger: Trigger) => void;
}): ReactNode {
  if (trigger.type === 'weather_kind') {
    return (
      <WeatherKindFields
        kinds={trigger.kinds}
        onChange={(kinds) => {
          onChange({ ...trigger, kinds });
        }}
      />
    );
  }
  return (
    <WeatherRuleFields
      rule={trigger}
      onChange={(rule) => {
        onChange({ ...trigger, ...rule });
      }}
    />
  );
}

type WeatherConditionOf = Extract<Condition, { type: 'weather' | 'weather_kind' | 'daylight' }>;

export function WeatherConditionFields({
  condition,
  onChange,
}: {
  readonly condition: WeatherConditionOf;
  readonly onChange: (condition: Condition) => void;
}): ReactNode {
  switch (condition.type) {
    case 'daylight':
      return <DaylightFields condition={condition} onChange={onChange} />;
    case 'weather_kind':
      return (
        <WeatherKindFields
          kinds={condition.kinds}
          onChange={(kinds) => {
            onChange({ ...condition, kinds });
          }}
        />
      );
    case 'weather':
      return (
        <WeatherRuleFields
          rule={condition}
          onChange={(rule) => {
            onChange({ ...condition, ...rule });
          }}
        />
      );
  }
}
