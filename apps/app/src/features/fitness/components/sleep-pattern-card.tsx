import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { SleepWindowBars, type BarsSpan } from '../../../components/charts';
import { Text } from '../../../components/text';
import type { SleepTrendView } from '../data/sleep-trend';
import { usualOf, windowColumnsOf } from '../model/sleep-trend-columns';
import { scheduleStatsOf, spreadLineOf } from '../model/sleep-trend-text';
import { windowLabel } from '../model/window';
import { RangeLabel, TrendStats } from './trend-stats';

export function SleepPatternCard({
  view,
  today,
}: {
  readonly view: SleepTrendView;
  readonly today: string;
}): ReactNode {
  const { trend, months, window } = view;
  const { pattern, bedtimeSpread } = trend;
  if (!view.loaded || pattern === null || bedtimeSpread === null || trend.recorded < 2) {
    return null;
  }
  const span: BarsSpan = window.range === 'day' ? 'week' : window.range;
  const columns = windowColumnsOf(trend, months);
  return (
    <Card
      title="Sleep schedule"
      icon="clock"
      action={<RangeLabel text={windowLabel(window, today)} />}
    >
      <SleepWindowBars
        columns={columns}
        span={span}
        usual={usualOf(pattern)}
        label="Sleep schedule"
      />
      <View className="gap-3">
        <TrendStats stats={scheduleStatsOf(pattern)} />
        <Text variant="footnote" tone="variant">
          {spreadLineOf(bedtimeSpread, trend.recorded, trend.rows.length)}
        </Text>
      </View>
    </Card>
  );
}
