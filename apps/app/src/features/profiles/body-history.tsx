import type { ReactNode } from 'react';
import { useState } from 'react';
import { Card } from '../../components/card';
import { TimeSeriesChart } from '../../components/charts';
import { Select } from '../../components/select';
import type { WeighedReading } from '../../store/people';
import { COMPOSITION_METRICS, formatMetric, metricValue } from './composition-metrics';

const WEIGHT = 'weight';

interface Series {
  readonly label: string;
  readonly unit: string;
  readonly valueOf: (reading: WeighedReading) => number | null;
  readonly format?: (value: number) => string;
}

const WEIGHT_SERIES: Series = {
  label: 'Weight',
  unit: 'kg',
  valueOf: (reading) => reading.weight_kg,
};

function seriesOf(key: string): Series {
  const metric = COMPOSITION_METRICS.find((candidate) => candidate.key === key);
  if (metric === undefined) {
    return WEIGHT_SERIES;
  }
  return {
    label: metric.label,
    unit: metric.unit,
    valueOf: (reading) =>
      reading.composition === null ? null : metricValue(reading.composition, metric),
    format: (value) => formatMetric(value, metric),
  };
}

function pointsOf(readings: readonly WeighedReading[], series: Series): { t: number; v: number }[] {
  return readings.flatMap((reading) => {
    const value = series.valueOf(reading);
    return value === null ? [] : [{ t: Date.parse(reading.measured_at), v: value }];
  });
}

export function BodyHistory({
  readings,
}: {
  readonly readings: readonly WeighedReading[];
}): ReactNode {
  const [key, setKey] = useState<string>(WEIGHT);
  const series = seriesOf(key);
  const options = [
    { value: WEIGHT, label: 'Weight' },
    ...COMPOSITION_METRICS.map((candidate) => ({ value: candidate.key, label: candidate.label })),
  ];
  return (
    <Card
      title="History"
      icon="trendUp"
      action={<Select label="Metric" options={options} value={key} onChange={setKey} />}
    >
      <TimeSeriesChart
        series={[{ points: pointsOf(readings, series), colour: 'viz-1', label: series.label }]}
        range="year"
        unit={series.unit}
        fit
        {...(series.format === undefined ? {} : { formatValue: series.format })}
      />
    </Card>
  );
}
