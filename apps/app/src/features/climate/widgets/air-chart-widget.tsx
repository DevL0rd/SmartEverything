import type { ReactNode } from 'react';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Sparkline, TimeSeriesChart, type ChartSeries } from '../../../components/charts';
import { ErrorState } from '../../../components/error-state';
import { Skeleton } from '../../../components/skeleton';
import { WidgetFrame } from '../../../components/widget-board';
import {
  metricSources,
  seriesOf,
  shouldFit,
  useAirHistory,
  type AirMetric,
} from '../data/air-history';
import { useClimateModels } from '../model/climate-devices';
import { background } from '@smarteverything/logging';
import { useClimateBody } from './use-body-box';

const MIN_CHART = 96;

const AIR_CHART_TITLES: Readonly<Record<AirMetric, string>> = {
  pm25: 'Air quality today',
  pm10: 'PM10 today',
  temperature: 'Temperature today',
  humidity: 'Humidity today',
  co2: 'CO₂ today',
};

function CompactTrend({
  series,
  height,
}: {
  readonly series: readonly ChartSeries[];
  readonly height: number;
}): ReactNode {
  const first = series[0];
  if (first === undefined || height <= 0) {
    return null;
  }
  return <Sparkline points={first.points} colour={first.colour} height={height} area />;
}

function Trend({
  series,
  unit,
}: {
  readonly series: readonly ChartSeries[];
  readonly unit: string | null;
}): ReactNode {
  const { height } = useClimateBody().box;
  const fitted = Math.floor(height);
  return fitted < MIN_CHART ? (
    <CompactTrend series={series} height={fitted} />
  ) : (
    <TimeSeriesChart
      series={series}
      range="24h"
      fit={shouldFit(series, '24h')}
      height={fitted}
      {...(unit === null ? {} : { unit })}
    />
  );
}

export function AirChartWidget({
  metric,
  room,
}: {
  readonly metric: AirMetric;
  readonly room: string | null;
}): ReactNode {
  const sources = metricSources(useClimateModels(room), metric);
  const history = useAirHistory(sources, '24h');
  const frame = {
    title: AIR_CHART_TITLES[metric],
    icon: 'activity',
    accent: 'viz-1',
    href: href.devicesPage('air'),
  } as const;
  if (history.isError) {
    return (
      <WidgetFrame
        {...frame}
        actions={
          <Button
            label="Try again"
            variant="tonal"
            onPress={() => {
              background(history.refetch(), 'history.refetch_failed');
            }}
          />
        }
      >
        <ErrorState error={history.error} />
      </WidgetFrame>
    );
  }
  return (
    <WidgetFrame {...frame}>
      {history.isPending ? (
        <Skeleton shape="block" className="flex-1" />
      ) : (
        <Trend
          series={seriesOf(history.data, sources, metric, '24h')}
          unit={sources[0]?.presented.unit ?? null}
        />
      )}
    </WidgetFrame>
  );
}
