import type { ReactNode } from 'react';
import { Gauge } from '../../../components/charts';
import { Figure } from '../../../components/figure';
import { Text } from '../../../components/text';
import type { MetricReading } from '../model/comfort';
import { dialScale } from '../model/metric-look';

export function MetricDial({
  reading,
  size,
}: {
  readonly reading: MetricReading;
  readonly size: number;
}): ReactNode {
  const scale = dialScale(reading);
  const big = size >= 120;
  return (
    <Gauge
      value={Math.min(Math.max(reading.amount, scale.min), scale.max)}
      min={scale.min}
      max={scale.max}
      bands={scale.bands}
      size={size}
      thickness={big ? 12 : 7}
      label={`${reading.label} ${reading.value}, ${reading.verdict}`}
    >
      <Figure value={reading.value} size={big ? 'l' : 's'} stale={reading.stale} />
      {reading.unit === null ? null : (
        <Text variant="caption" tone="variant">
          {reading.unit}
        </Text>
      )}
    </Gauge>
  );
}
