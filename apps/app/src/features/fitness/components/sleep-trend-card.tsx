import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { StageMixBars, type BarsSpan } from '../../../components/charts';
import { ErrorState } from '../../../components/error-state';
import { Figure } from '../../../components/figure';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { hoursMinutes } from '../../../format/time';
import { useLastDayOf } from '../data/latest-days';
import { useGoals } from '../data/goals';
import type { SleepTrendView } from '../data/sleep-trend';
import { seriesOf } from '../model/catalogue';
import { mixColumnsOf } from '../model/sleep-trend-columns';
import { mixLineOf, trendStatsOf } from '../model/sleep-trend-text';
import { windowLabel } from '../model/window';
import { NoDataRow } from './no-data-row';
import { RangeLabel, TrendStats } from './trend-stats';

function Empty({ view }: { readonly view: SleepTrendView }): ReactNode {
  const lastDay = useLastDayOf(seriesOf('sleep'), view.window.firstDay);
  return <NoDataRow what="sleep data" lastDay={lastDay} />;
}

export function SleepTrendCard({
  view,
  today,
}: {
  readonly view: SleepTrendView;
  readonly today: string;
}): ReactNode {
  const goals = useGoals();
  const { trend, months, window } = view;
  if (view.error !== null) {
    return <ErrorState error={view.error} />;
  }
  if (!view.loaded) {
    return <Skeleton shape="block" className="h-72" />;
  }
  if (trend.recorded === 0 || trend.average === null) {
    return <Empty view={view} />;
  }
  const span: BarsSpan = window.range === 'day' ? 'week' : window.range;
  return (
    <Card title="Time asleep" icon="moon" action={<RangeLabel text={windowLabel(window, today)} />}>
      <Figure value={hoursMinutes(trend.average.minutes)} unit="average per night" size="l" />
      <StageMixBars
        columns={mixColumnsOf(trend, months)}
        span={span}
        goal={goals.sleep_minutes}
        average={trend.average.minutes}
        label="Time asleep"
      />
      <View className="gap-3">
        <TrendStats stats={trendStatsOf(trend, months, window.range)} />
        {trend.mix === null ? null : (
          <Text variant="footnote" tone="variant">
            {mixLineOf(trend.mix)}
          </Text>
        )}
      </View>
      <Button
        label="Details"
        variant="text"
        href={href.healthMetric('sleep', { day: window.firstDay, range: window.range })}
      />
    </Card>
  );
}
