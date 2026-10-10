import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { BodyComposition } from '@smarteverything/domain';
import { Card } from '../../components/card';
import { Figure } from '../../components/figure';
import { Grid } from '../../components/grid';
import { Text } from '../../components/text';
import { BandBar, BandLabel } from './band-bar';
import {
  COMPOSITION_METRICS,
  formatMetric,
  metricValue,
  type CompositionMetric,
} from './composition-metrics';

function MetricTile({
  composition,
  metric,
}: {
  readonly composition: BodyComposition;
  readonly metric: CompositionMetric;
}): ReactNode {
  const value = metricValue(composition, metric);
  const band = metric.band === null ? undefined : composition.bands[metric.band];
  if (value === null) {
    return null;
  }
  return (
    <View className="gap-1.5 rounded-lg bg-surface-2 p-card-pad">
      <View className="flex-row items-baseline justify-between gap-2">
        <Text variant="footnote" tone="variant" numberOfLines={1}>
          {metric.label}
        </Text>
        {band === undefined || metric.band === null ? null : (
          <BandLabel metric={metric.band} band={band} />
        )}
      </View>
      <Figure
        value={formatMetric(value, metric)}
        {...(metric.unit === '' ? {} : { unit: metric.unit })}
        size="m"
      />
      {band === undefined || metric.band === null ? null : (
        <BandBar metric={metric.band} band={band} />
      )}
    </View>
  );
}

export function CompositionGrid({
  composition,
}: {
  readonly composition: BodyComposition;
}): ReactNode {
  return (
    <Card title="Body composition" icon="scale">
      <View className="gap-3">
        <Grid minItemWidth={150} gap="tight">
          {COMPOSITION_METRICS.map((metric) => (
            <MetricTile key={metric.key} composition={composition} metric={metric} />
          ))}
        </Grid>
        <Text variant="caption" tone="faint">
          Estimates from the scale’s two impedance readings, your height, age and sex. Not a medical
          measurement.
        </Text>
      </View>
    </Card>
  );
}
