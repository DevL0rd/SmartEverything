import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Segmented } from '../../../components/segmented';
import { Select } from '../../../components/select';
import {
  METRIC_OPTIONS,
  METRIC_PICKS,
  TREND_OPTIONS,
  type MetricOptions,
  type TrendOptions,
} from '../model/metric-choices';

const RANGE_CHOICES = [
  { value: 'week', label: '7 days' },
  { value: 'month', label: '30 days' },
] satisfies readonly { value: TrendOptions['range']; label: string }[];

export function MetricEditor({
  value,
  onChange,
}: {
  readonly value: MetricOptions;
  readonly onChange: (value: MetricOptions) => void;
}): ReactNode {
  return (
    <Select
      label="Metric"
      options={METRIC_PICKS}
      value={value.metric}
      searchable
      onChange={(metric) => {
        onChange(METRIC_OPTIONS.parse({ metric }));
      }}
    />
  );
}

export function TrendEditor({
  value,
  onChange,
}: {
  readonly value: TrendOptions;
  readonly onChange: (value: TrendOptions) => void;
}): ReactNode {
  return (
    <View className="gap-4">
      <Select
        label="Metric"
        options={METRIC_PICKS}
        value={value.metric}
        searchable
        onChange={(metric) => {
          onChange(TREND_OPTIONS.parse({ ...value, metric }));
        }}
      />
      <Segmented
        label="Period"
        options={RANGE_CHOICES}
        value={value.range}
        onChange={(range) => {
          onChange({ ...value, range });
        }}
      />
    </View>
  );
}
