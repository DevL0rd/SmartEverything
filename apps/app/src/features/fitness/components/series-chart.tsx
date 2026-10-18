import type { ReactNode } from 'react';
import { Bars, RangeBars, TimeSeriesChart } from '../../../components/charts';
import type { SeriesView } from '../data/series';
import { formatAmount } from '../model/catalogue';
import { barsOf, chartPointsOf, rangeBucketsOf } from '../model/series-stats';
import type { SeriesSpec } from '../model/series-spec';

const HEIGHT = 200;

export function SeriesChart({
  spec,
  view,
}: {
  readonly spec: SeriesSpec;
  readonly view: SeriesView;
}): ReactNode {
  const range = view.window.range;
  const format = (value: number): string => formatAmount(spec, value);
  const label = `${spec.label}, ${range}`;
  if (spec.chart === 'bars') {
    return (
      <Bars
        bars={barsOf(range, view.buckets)}
        colour={spec.colour}
        label={label}
        height={HEIGHT}
        formatValue={format}
      />
    );
  }
  if (spec.chart === 'range' && range !== 'day') {
    return (
      <RangeBars
        buckets={rangeBucketsOf(range, view.buckets)}
        colour={spec.colour}
        label={label}
        height={HEIGHT}
        formatValue={format}
      />
    );
  }
  return (
    <TimeSeriesChart
      series={[
        {
          points: chartPointsOf(view.points, view.window.start, view.window.end),
          colour: spec.colour,
          label: spec.label,
        },
      ]}
      range={range}
      unit={spec.unit}
      height={HEIGHT}
      formatValue={format}
    />
  );
}
