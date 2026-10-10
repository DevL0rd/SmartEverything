import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { BodyComposition } from '@smarteverything/domain';
import { Badge } from '../../../components/badge';
import { Text } from '../../../components/text';
import {
  BODY_TYPE_LABELS,
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
}: {
  readonly composition: BodyComposition;
  readonly metric: CompositionMetric;
}): ReactNode {
  const value = metricValue(composition, metric);
  if (value === null) {
    return null;
  }
  const band = metric.band === null ? undefined : composition.bands[metric.band];
  return (
    <View className="min-w-0 flex-1 gap-0.5 rounded-md bg-surface-2 px-3 py-2">
      <Text variant="caption" tone="variant" numberOfLines={1}>
        {metric.label}
      </Text>
      <Text variant="callout" className="tabular" numberOfLines={1}>
        {metric.unit === ''
          ? formatMetric(value, metric)
          : `${formatMetric(value, metric)} ${metric.unit}`}
      </Text>
      {band === undefined || metric.band === null ? null : (
        <BandLabel metric={metric.band} band={band} />
      )}
    </View>
  );
}

export function CompositionChips({
  composition,
  keys,
  columns,
}: {
  readonly composition: BodyComposition;
  readonly keys: readonly ChipKey[];
  readonly columns: number;
}): ReactNode {
  const metrics = keys.flatMap((key) => {
    const metric = metricOf(key);
    return metric === undefined ? [] : [metric];
  });
  const rows = Array.from({ length: Math.ceil(metrics.length / columns) }, (_, index) =>
    metrics.slice(index * columns, index * columns + columns),
  );
  return (
    <View className="gap-2">
      {rows.map((row) => (
        <View key={row.map((metric) => metric.key).join()} className="flex-row gap-2">
          {row.map((metric) => (
            <Chip key={metric.key} composition={composition} metric={metric} />
          ))}
        </View>
      ))}
    </View>
  );
}

export function BodyBadges({ composition }: { readonly composition: BodyComposition }): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-2">
      <Badge label={`Body score ${String(composition.body_score)}`} tone="primary" />
      <Badge label={BODY_TYPE_LABELS[composition.body_type]} tone="neutral" />
      <Badge label={`Body age ${String(composition.body_age)}`} tone="neutral" />
    </View>
  );
}
