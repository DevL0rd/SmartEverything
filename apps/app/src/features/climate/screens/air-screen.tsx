import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { TimeSeriesChart } from '../../../components/charts';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { Grid } from '../../../components/grid';
import { PageHeader } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { Segmented } from '../../../components/segmented';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import {
  AIR_METRICS,
  AIR_RANGES,
  metricSources,
  seriesOf,
  shouldFit,
  useAirHistory,
  type AirMetric,
  type AirRange,
  type MetricSource,
} from '../data/air-history';
import { useClimateSources } from '../model/climate-devices';

const CHART_HEIGHT = 220;

function MetricChart({
  metric,
  sources,
  range,
}: {
  readonly metric: AirMetric;
  readonly sources: readonly MetricSource[];
  readonly range: AirRange;
}): ReactNode {
  const history = useAirHistory(sources, range);
  if (history.isPending) {
    return <Skeleton shape="block" className="h-55" />;
  }
  if (history.isError) {
    return <ErrorState error={history.error} retry={() => void history.refetch()} />;
  }
  const series = seriesOf(history.data, sources, metric, range);
  if (series.length === 0) {
    return (
      <Text variant="callout" tone="variant">
        No readings in this period
      </Text>
    );
  }
  const unit = sources[0]?.presented.unit ?? null;
  return (
    <TimeSeriesChart
      series={series}
      range={range}
      fit={shouldFit(series, range)}
      height={CHART_HEIGHT}
      {...(unit === null ? {} : { unit })}
    />
  );
}

function MetricCard({
  title,
  metric,
  sources,
  range,
}: {
  readonly title: string;
  readonly metric: AirMetric;
  readonly sources: readonly MetricSource[];
  readonly range: AirRange;
}): ReactNode {
  return (
    <Card title={title}>
      <MetricChart metric={metric} sources={sources} range={range} />
    </Card>
  );
}

export function AirScreen(): ReactNode {
  const sources = useClimateSources(null);
  const [range, setRange] = useState<AirRange>('24h');
  const metrics = AIR_METRICS.flatMap((metric) => {
    const found = metricSources(sources, metric);
    const first = found[0];
    return first === undefined ? [] : [{ metric, sources: found, title: first.presented.label }];
  });
  const header = <PageHeader title="Air history" />;
  if (metrics.length === 0) {
    return (
      <Screen header={header} maxWidth="reading">
        <EmptyState
          icon="activity"
          title="No air readings yet"
          body="Purifiers and air sensors keep a history here."
          action={<Button label="Back to Devices" href={href.devices()} />}
        />
      </Screen>
    );
  }
  return (
    <Screen header={header} maxWidth="detail">
      <View className="gap-section-gap">
        <Segmented label="Period" options={AIR_RANGES} value={range} onChange={setRange} />
        <Grid minItemWidth={420} maxColumns={2}>
          {metrics.map((entry) => (
            <MetricCard
              key={entry.metric}
              title={entry.title}
              metric={entry.metric}
              sources={entry.sources}
              range={range}
            />
          ))}
        </Grid>
      </View>
    </Screen>
  );
}
