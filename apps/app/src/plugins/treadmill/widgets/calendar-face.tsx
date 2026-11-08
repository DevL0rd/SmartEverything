import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import { LoadedQuery } from '../../../components/loaded-query';
import { Text } from '../../../components/text';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import { useDayKey } from '../../../store/clock';
import { GhostBars } from '../components/ghost-bars';
import { HeatMap } from '../components/heat-map';
import { useTreadmillView } from '../data/treadmill-data';
import { kilometresText, minutesText } from '../model/stats-model';
import { streakLine, type StatsView } from '../model/today-model';
import { bodyHeightOf } from '../model/widget-model';
import { FitPlot } from './progress-faces';

const SHORT_CHART_LABEL_ROOM = 20;

function MonthSummary({
  view,
  stacked,
}: {
  readonly view: StatsView;
  readonly stacked: boolean;
}): ReactNode {
  const { stats } = view;
  return (
    <View className={stacked ? 'gap-1' : 'flex-row flex-wrap items-center gap-x-4 gap-y-1'}>
      <View className="flex-row items-center gap-1.5">
        <Icon name="flame" size={16} tone={stats.streak.current > 0 ? 'warning' : 'faint'} />
        <Text variant="caption" numberOfLines={1}>
          {streakLine(stats.streak)}
        </Text>
      </View>
      <Text variant="caption" tone="variant" className="tabular">
        This month: {kilometresText(stats.totals.distanceM)} ·{' '}
        {minutesText(stats.totals.activeSeconds)}
      </Text>
    </View>
  );
}

function MonthBars({
  view,
  height,
}: {
  readonly view: StatsView;
  readonly height: number;
}): ReactNode {
  const { stats } = view;
  return (
    <GhostBars
      buckets={stats.buckets}
      previous={stats.previousBuckets}
      range="month"
      metric="distance"
      label={`Distance per day this month, ${kilometresText(stats.totals.distanceM)} in total`}
      height={height}
    />
  );
}

function Body({ view, today }: { readonly view: StatsView; readonly today: string }): ReactNode {
  const { stats } = view;
  const { cls, frame } = useWidgetFace();
  if (cls !== 'l' && cls !== 'xl') {
    return (
      <View className="flex-1 flex-row items-start gap-4">
        <MonthSummary view={view} stacked />
        <HeatMap
          heatmap={stats.heatmap}
          today={today}
          plotHeight={bodyHeightOf(frame) - SHORT_CHART_LABEL_ROOM}
        />
      </View>
    );
  }
  return (
    <View className="flex-1 gap-3">
      <HeatMap heatmap={stats.heatmap} today={today} />
      <FitPlot>{(plot) => <MonthBars view={view} height={plot} />}</FitPlot>
      <MonthSummary view={view} stacked={false} />
    </View>
  );
}

export function CalendarFace({ deviceId }: { readonly deviceId: string }): ReactNode {
  const today = useDayKey();
  const stats = useTreadmillView(deviceId, 'stats', { range: 'month', anchor: today });
  return <LoadedQuery query={stats}>{(view) => <Body view={view} today={today} />}</LoadedQuery>;
}
