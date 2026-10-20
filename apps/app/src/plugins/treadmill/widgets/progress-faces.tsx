import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Rings } from '../../../components/charts';
import { Icon } from '../../../components/icon';
import { LoadedQuery } from '../../../components/loaded-query';
import { Text } from '../../../components/text';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import { cn } from '../../../design/cn';
import { GhostBars } from '../components/ghost-bars';
import { useTreadmillView } from '../data/treadmill-data';
import { kilometresText } from '../model/stats-model';
import {
  RING_DOT,
  ringSentence,
  streakLine,
  type StatsView,
  type TodayRing,
} from '../model/today-model';
import { bodyHeightOf, legendLines, ringsWithClimb } from '../model/widget-model';

function Legend({
  rings,
  lines,
}: {
  readonly rings: readonly TodayRing[];
  readonly lines: number;
}): ReactNode {
  return (
    <View className="min-w-0 gap-1">
      {rings.slice(0, lines).map((item) => (
        <View
          key={item.key}
          accessible
          accessibilityLabel={ringSentence(item)}
          className="flex-row items-center gap-2"
        >
          <View className={cn('size-2 rounded-full', RING_DOT[item.colour])} />
          <Text variant="caption" numberOfLines={2} className="tabular min-w-0 shrink">
            {item.name}: {item.done} of {item.goal}
          </Text>
        </View>
      ))}
    </View>
  );
}

function WeekBars({
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
      range="week"
      metric="distance"
      label={`Distance per day this week, ${kilometresText(stats.totals.distanceM)} in total`}
      height={height}
    />
  );
}

function Streak({ view }: { readonly view: StatsView }): ReactNode {
  const { streak } = view.stats;
  return (
    <View className="flex-row items-center gap-2">
      <Icon name="flame" size={16} tone={streak.current > 0 ? 'warning' : 'faint'} />
      <Text variant="caption" numberOfLines={1}>
        {streakLine(streak)}
      </Text>
    </View>
  );
}

function RingsOf({
  rings,
  size,
}: {
  readonly rings: readonly TodayRing[];
  readonly size: number;
}): ReactNode {
  return (
    <Rings
      size={size}
      rings={rings.map((item) => ({
        progress: item.progress,
        colour: item.colour,
        label: ringSentence(item),
      }))}
    />
  );
}

function Body({ view }: { readonly view: StatsView }): ReactNode {
  const { cls, frame } = useWidgetFace();
  const body = bodyHeightOf(frame);
  const wide = cls === 'w' || cls === 'xl';
  const rings = ringsWithClimb(view);
  if (cls === 'l') {
    const ring = 104;
    return (
      <View className="flex-1 gap-3">
        <View className="flex-row items-center gap-4">
          <RingsOf rings={rings} size={ring} />
          <View className="min-w-0 flex-1 gap-2">
            <Legend rings={rings} lines={3} />
            <Streak view={view} />
          </View>
        </View>
        <View className="min-h-0 flex-1 justify-end">
          <WeekBars view={view} height={Math.max(40, body - ring - 64)} />
        </View>
      </View>
    );
  }
  const ring = Math.min(112, Math.max(72, body - 8));
  return (
    <View className="flex-1 flex-row items-center gap-4">
      <RingsOf rings={rings} size={ring} />
      <View className="min-w-0 flex-1 gap-2">
        <Legend rings={rings} lines={legendLines(wide, body)} />
        {cls === 'xl' ? <Streak view={view} /> : null}
      </View>
      {wide ? (
        <View className="min-w-0 flex-1">
          <WeekBars view={view} height={Math.max(40, body - 36)} />
        </View>
      ) : null}
    </View>
  );
}

export function ProgressFace({ deviceId }: { readonly deviceId: string }): ReactNode {
  const stats = useTreadmillView(deviceId, 'stats', { range: 'week' });
  return <LoadedQuery query={stats}>{(view) => <Body view={view} />}</LoadedQuery>;
}
