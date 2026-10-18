import {
  WEATHER_KINDS,
  WEATHER_KIND_LABELS,
  WEATHER_METRICS,
  WEATHER_METRIC_INFO,
  type SignalTriggerV2,
  type WeatherKind,
  type WeatherMetric,
} from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { z } from 'zod';
import { Checkbox } from '../../../components/checkbox';
import { NumberStepper } from '../../../components/number-stepper';
import { Segmented } from '../../../components/segmented';
import { Select } from '../../../components/select';
import type { Catalog } from '../data/use-automations';
import type { TestOperator } from '../model/capability-choices';
import { isWeatherKindSignal } from '../model/signal-triggers';
import { weatherKindsOf, type Daylight } from '../model/weather-text';
import { Labelled } from './labelled';
import { TestFields } from './test-fields';

const WEATHER_OPERATORS: readonly TestOperator[] = ['gt', 'gte', 'lt', 'lte', 'between'];
const METRIC = z.enum(WEATHER_METRICS);

const METRIC_OPTIONS = WEATHER_METRICS.map((metric) => ({
  value: metric,
  label: WEATHER_METRIC_INFO[metric].label,
}));

const REGULAR_KINDS: readonly WeatherKind[] = ['rain', 'storm'];

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
        value={condition.daylight}
        options={[
          { value: 'day', label: 'Daytime', icon: 'sun' },
          { value: 'night', label: 'After dark', icon: 'moon' },
        ]}
        onChange={(daylight) => {
          onChange({ ...condition, daylight });
        }}
      />
      <Labelled label="Shift sunrise by">
        <NumberStepper
          label="Shift sunrise by"
          value={condition.sunriseOffset ?? 0}
          min={-180}
          max={180}
          step={15}
          unit="min"
          onChange={(sunriseOffset) => {
            onChange({ ...condition, sunriseOffset });
          }}
        />
      </Labelled>
      <Labelled label="Shift sunset by">
        <NumberStepper
          label="Shift sunset by"
          value={condition.sunsetOffset ?? 0}
          min={-180}
          max={180}
          step={15}
          unit="min"
          onChange={(sunsetOffset) => {
            onChange({ ...condition, sunsetOffset });
          }}
        />
      </Labelled>
    </View>
  );
}

function clamped(metric: WeatherMetric, value: number): number {
  const info = WEATHER_METRIC_INFO[metric];
  return Math.min(Math.max(value, info.min), info.max);
}

function metricOf(trigger: SignalTriggerV2): WeatherMetric | null {
  const parsed = METRIC.safeParse(trigger.field);
  return parsed.success ? parsed.data : null;
}

function withMetric(trigger: SignalTriggerV2, field: WeatherMetric | 'kind'): SignalTriggerV2 {
  if (field === 'kind') return { ...trigger, field, test: { is: 'in', to: [...REGULAR_KINDS] } };
  const anchor = trigger.test?.is === 'gt' ? trigger.test.to : 30;
  return { ...trigger, field, test: { is: 'gt', to: clamped(field, anchor) } };
}

export function WeatherTriggerFields({
  catalog,
  trigger,
  onChange,
}: {
  readonly catalog: Catalog;
  readonly trigger: SignalTriggerV2;
  readonly onChange: (trigger: SignalTriggerV2) => void;
}): ReactNode {
  const metric = metricOf(trigger);
  const test = trigger.test;
  const kind = isWeatherKindSignal(trigger);
  return (
    <View className="gap-3">
      <Select
        label="Reading"
        value={kind ? 'kind' : metric}
        options={[...METRIC_OPTIONS, { value: 'kind' as const, label: 'Kind of weather' }]}
        onChange={(next) => {
          onChange(withMetric(trigger, next));
        }}
      />
      {kind && test?.is === 'in' ? (
        <WeatherKindFields
          kinds={weatherKindsOf(test.to)}
          onChange={(kinds) => {
            onChange({ ...trigger, test: { is: 'in', to: kinds } });
          }}
        />
      ) : null}
      {metric !== null && test !== undefined ? (
        <TestFields
          catalog={catalog}
          shape={{ type: 'weather', metric }}
          test={test}
          operators={WEATHER_OPERATORS}
          onChange={(next) => {
            onChange({ ...trigger, test: next });
          }}
        />
      ) : null}
    </View>
  );
}
