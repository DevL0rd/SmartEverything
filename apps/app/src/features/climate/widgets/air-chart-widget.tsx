import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Sparkline, TimeSeriesChart, type ChartSeries } from '../../../components/charts';
import { ErrorState } from '../../../components/error-state';
import { Skeleton } from '../../../components/skeleton';
import { WidgetFrame, type WidgetSize } from '../../../components/widget-board';
import {
  metricSources,
  seriesOf,
  shouldFit,
  useAirHistory,
  type AirMetric,
} from '../data/air-history';
import { useClimateSources } from '../model/climate-devices';

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

function Chart({
  metric,
  room,
}: {
  readonly metric: AirMetric;
  readonly room: string | null;
}): ReactNode {
  const sources = metricSources(useClimateSources(room), metric);
  const history = useAirHistory(sources, '24h');
  const [height, setHeight] = useState(0);
  if (history.isPending) {
    return <Skeleton shape="block" className="flex-1" />;
  }
  if (history.isError) {
    return <ErrorState error={history.error} retry={() => void history.refetch()} />;
  }
  const unit = sources[0]?.presented.unit ?? null;
  const series = seriesOf(history.data, sources, metric, '24h');
  return (
    <View
      className="flex-1"
      onLayout={(event) => {
        setHeight(Math.round(event.nativeEvent.layout.height));
      }}
    >
      {height < MIN_CHART ? (
        <CompactTrend series={series} height={height} />
      ) : (
        <TimeSeriesChart
          series={series}
          range="24h"
          fit={shouldFit(series, '24h')}
          height={height}
          {...(unit === null ? {} : { unit })}
        />
      )}
    </View>
  );
}

export function AirChartWidget({
  metric,
  room,
  size,
}: {
  readonly metric: AirMetric;
  readonly room: string | null;
  readonly size: WidgetSize;
}): ReactNode {
  return (
    <WidgetFrame
      title={AIR_CHART_TITLES[metric]}
      icon="activity"
      accent="viz-1"
      size={size}
      href={href.devicesPage('air')}
    >
      <Chart metric={metric} room={room} />
    </WidgetFrame>
  );
}
