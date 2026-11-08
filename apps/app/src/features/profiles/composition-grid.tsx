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
  value,
}: {
  readonly composition: BodyComposition;
  readonly metric: CompositionMetric;
  readonly value: number;
}): ReactNode {
  const band = metric.band === null ? undefined : composition.bands[metric.band];
  return (
    <View className="grow gap-1.5 rounded-lg bg-surface-2 p-3">
      <View className="flex-row flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <Text variant="footnote" tone="variant" className="shrink">
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
          {COMPOSITION_METRICS.flatMap((metric) => {
            const value = metricValue(composition, metric);
            return value === null
              ? []
              : [
                  <MetricTile
                    key={metric.key}
                    composition={composition}
                    metric={metric}
                    value={value}
                  />,
                ];
          })}
        </Grid>
        <Text variant="caption" tone="faint">
          Estimates from the scale’s two impedance readings, your height, age and sex. Not a medical
          measurement.
        </Text>
      </View>
    </Card>
  );
}
