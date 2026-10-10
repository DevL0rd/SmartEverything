import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Figure } from '../../../components/figure';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { ErrorState } from '../../../components/error-state';
import type { Tone } from '../../../components/tone';
import { useLastDayOf } from '../data/latest-days';
import { useSeries, type SeriesView } from '../data/series';
import { formatAmount } from '../model/catalogue';
import { headlineLabel, seriesStats } from '../model/series-stats';
import type { SeriesSpec } from '../model/series-spec';
import type { Window } from '../model/window';
import { DetailColumns } from './detail-columns';
import { NoDataRow } from './no-data-row';
import { SeriesChart } from './series-chart';
import { StatList } from './stat-list';

const TREND_TONE: Readonly<Record<string, Tone>> = { true: 'positive', false: 'warning' };

function Headline({
  spec,
  view,
}: {
  readonly spec: SeriesSpec;
  readonly view: SeriesView;
}): ReactNode {
  const headline = view.summary.headline;
  return (
    <View className="gap-0.5">
      <Text variant="footnote" tone="variant">
        {headlineLabel(spec, view.window.range)}
      </Text>
      <Figure
        value={headline === null ? '—' : formatAmount(spec, headline)}
        unit={spec.unit}
        size="l"
      />
    </View>
  );
}

function Stats({
  spec,
  view,
}: {
  readonly spec: SeriesSpec;
  readonly view: SeriesView;
}): ReactNode {
  const stats = seriesStats({
    spec,
    range: view.window.range,
    summary: view.summary,
    previous: view.previous,
    trend: view.trend,
    buckets: view.buckets,
  });
  return (
    <StatList
      stats={stats.map((stat) => ({
        label: stat.label,
        value: stat.value,
        ...(stat.note === undefined ? {} : { note: stat.note }),
        ...(stat.good === undefined || stat.good === null
          ? {}
          : { tone: TREND_TONE[String(stat.good)] }),
      }))}
    />
  );
}

function Empty({
  spec,
  window,
}: {
  readonly spec: SeriesSpec;
  readonly window: Window;
}): ReactNode {
  const lastDay = useLastDayOf(spec, window.firstDay);
  return <NoDataRow what={`${spec.label.toLowerCase()} data`} lastDay={lastDay} />;
}

export function MetricSection({
  spec,
  window,
  link = true,
}: {
  readonly spec: SeriesSpec;
  readonly window: Window;
  readonly link?: boolean;
}): ReactNode {
  const view = useSeries(spec, window, false);
  if (view.problem !== null) {
    return <ErrorState error={new Error(view.problem)} />;
  }
  if (view.loading) {
    return <Skeleton shape="block" className="h-72" />;
  }
  if (view.summary.count === 0) {
    return <Empty spec={spec} window={window} />;
  }
  return (
    <Card
      title={spec.label}
      icon={spec.icon}
      action={
        link ? (
          <Button
            label="Details"
            variant="text"
            href={href.healthMetric(spec.key, { day: window.firstDay, range: window.range })}
          />
        ) : undefined
      }
    >
      <DetailColumns
        main={
          <View className="gap-3">
            <Headline spec={spec} view={view} />
            <SeriesChart spec={spec} view={view} />
          </View>
        }
        side={<Stats spec={spec} view={view} />}
      />
    </Card>
  );
}
