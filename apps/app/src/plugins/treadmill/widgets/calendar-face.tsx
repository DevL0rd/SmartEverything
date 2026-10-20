import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import { LoadedQuery } from '../../../components/loaded-query';
import { Text } from '../../../components/text';
import { useDayKey } from '../../../store/clock';
import { GhostBars } from '../components/ghost-bars';
import { HeatMap } from '../components/heat-map';
import { useTreadmillView } from '../data/treadmill-data';
import { kilometresText, minutesText } from '../model/stats-model';
import { streakLine, type StatsView } from '../model/today-model';
import { bodyHeightOf, calendarBarsHeight } from '../model/widget-model';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';

function Body({ view, today }: { readonly view: StatsView; readonly today: string }): ReactNode {
  const { stats } = view;
  const { cls, frame } = useWidgetFace();
  const tall = cls === 'l' || cls === 'xl';
  const bars = calendarBarsHeight(bodyHeightOf(frame), frame.width);
  return (
    <View className="flex-1 justify-between gap-3">
      <HeatMap heatmap={stats.heatmap} today={today} />
      {tall && bars > 0 ? (
        <GhostBars
          buckets={stats.buckets}
          previous={stats.previousBuckets}
          range="month"
          metric="distance"
          label={`Distance per day this month, ${kilometresText(stats.totals.distanceM)} in total`}
          height={bars}
        />
      ) : null}
      <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
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
    </View>
  );
}

export function CalendarFace({ deviceId }: { readonly deviceId: string }): ReactNode {
  const today = useDayKey();
  const stats = useTreadmillView(deviceId, 'stats', { range: 'month', anchor: today });
  return <LoadedQuery query={stats}>{(view) => <Body view={view} today={today} />}</LoadedQuery>;
}
