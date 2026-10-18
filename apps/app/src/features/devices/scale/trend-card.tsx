import { useState, type ReactNode } from 'react';
import { Card } from '../../../components/card';
import { TimeSeriesChart } from '../../../components/charts';
import { Segmented } from '../../../components/segmented';
import { Text } from '../../../components/text';
import { OUTLIER_RULES } from '@smarteverything/domain';
import { percent } from '../../../format/number';
import { DEFAULT_RANGE, TREND_RANGES, rangeOf, trendOf, type TrendRange } from './trend-model';
import type { Scale } from './use-scale';

const OPTIONS = TREND_RANGES.map(({ value, label }) => ({ value, label }));
const CHART_HEIGHT = 200;

function notCountedNote(count: number): string {
  const were = count === 1 ? 'was' : 'were';
  return `${String(count)} ${count === 1 ? 'reading' : 'readings'} ${were} more than ${percent(OUTLIER_RULES.fractionFromMedian)} from the usual weight, so ${count === 1 ? 'it is' : 'they are'} not counted.`;
}

export function TrendCard({ scale }: { readonly scale: Scale }): ReactNode {
  const [range, setRange] = useState<TrendRange>(DEFAULT_RANGE);
  if (scale.person === null) {
    return null;
  }
  const trend = trendOf(scale.person.weighIns, range, scale.now);
  return (
    <Card title="Trend" icon="activity">
      <Segmented label="Range" value={range} onChange={setRange} options={OPTIONS} />
      <TimeSeriesChart
        series={[{ points: trend.counted, colour: 'viz-1', label: 'Weight' }]}
        range={rangeOf(range).chart}
        fit
        unit="kg"
        height={CHART_HEIGHT}
        label="Weight trend"
      />
      {trend.notCounted.length === 0 ? null : (
        <Text variant="caption" tone="variant">
          {notCountedNote(trend.notCounted.length)}
        </Text>
      )}
    </Card>
  );
}
