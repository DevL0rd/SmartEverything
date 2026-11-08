import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { BodyComposition } from '@smarteverything/domain';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import {
  BandLabel,
  COMPOSITION_METRICS,
  formatMetric,
  metricValue,
  type CompositionMetric,
} from '../../profiles';

export type ChipKey = CompositionMetric['key'];

export const BASIC_CHIPS: readonly ChipKey[] = [
  'muscle_mass_kg',
  'water_percent',
  'visceral_fat',
  'bmr_kcal',
];

export const REPORT_CHIPS: readonly ChipKey[] = [...BASIC_CHIPS, 'protein_percent', 'bone_mass_kg'];

function metricOf(key: ChipKey): CompositionMetric | undefined {
  return COMPOSITION_METRICS.find((metric) => metric.key === key);
}

function Chip({
  composition,
  metric,
  compact,
}: {
  readonly composition: BodyComposition;
  readonly metric: CompositionMetric;
  readonly compact: boolean;
}): ReactNode {
  const value = metricValue(composition, metric);
  if (value === null) {
    return null;
  }
  const band = metric.band === null ? undefined : composition.bands[metric.band];
  const valueText =
    metric.unit === ''
      ? formatMetric(value, metric)
      : `${formatMetric(value, metric)} ${metric.unit}`;
  return (
    <View
      className={cn(
        'min-w-0 flex-1 rounded-md bg-surface-2 px-2',
        compact ? 'py-0.5' : 'gap-0.5 py-1.5',
      )}
    >
      <Text variant="caption" tone="variant">
        {metric.label}
      </Text>
      <View className={compact ? 'flex-row flex-wrap items-baseline gap-x-1' : 'gap-0.5'}>
        <Text variant={compact ? 'caption' : 'callout'} className="tabular">
          {valueText}
        </Text>
        {band === undefined || metric.band === null ? null : (
          <BandLabel metric={metric.band} band={band} />
        )}
      </View>
    </View>
  );
}

export function CompositionChips({
  composition,
  keys,
  columns,
  compact = false,
}: {
  readonly composition: BodyComposition;
  readonly keys: readonly ChipKey[];
  readonly columns: number;
  readonly compact?: boolean;
}): ReactNode {
  const metrics = keys.flatMap((key) => {
    const metric = metricOf(key);
    return metric === undefined ? [] : [metric];
  });
  const rows = Array.from({ length: Math.ceil(metrics.length / columns) }, (_, index) =>
    metrics.slice(index * columns, index * columns + columns),
  );
  return (
    <View className={compact ? 'gap-1' : 'gap-2'}>
      {rows.map((row) => (
        <View key={row.map((metric) => metric.key).join()} className="flex-row gap-2">
          {row.map((metric) => (
            <Chip key={metric.key} composition={composition} metric={metric} compact={compact} />
          ))}
        </View>
      ))}
    </View>
  );
}

export { BodyBadges } from '../../profiles';
