import { useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Rings } from '../../../components/charts';
import { Icon } from '../../../components/icon';
import { LoadedQuery } from '../../../components/loaded-query';
import { Text } from '../../../components/text';
import type { FrameClass, WidgetFrameBox } from '../../../components/widget-board';
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
import { bodyHeightOf, ringsWithClimb } from '../model/widget-model';

const STACK_GAP = 12;
const SUBPIXEL = 0.5;

export function FitPlot({
  className,
  children,
}: {
  readonly className?: string;
  readonly children: (plot: number) => ReactNode;
}): ReactNode {
  const [room, setRoom] = useState(0);
  const [chrome, setChrome] = useState(0);
  const plot = Math.max(0, Math.floor(room - chrome));
  const onRoom = (event: LayoutChangeEvent): void => {
    setRoom(event.nativeEvent.layout.height);
  };
  const onContent = (event: LayoutChangeEvent): void => {
    setChrome(Math.max(0, Math.ceil(event.nativeEvent.layout.height - plot)));
  };
  return (
    <View className={cn('min-h-0 min-w-0 flex-1', className)} onLayout={onRoom}>
      <View onLayout={onContent}>{children(plot)}</View>
    </View>
  );
}

function progressRingPx(cls: FrameClass, frame: WidgetFrameBox): number {
  const body = bodyHeightOf(frame);
  if (cls === 'l') {
    return Math.floor((body - STACK_GAP) / 2);
  }
  return cls === 'xl' ? Math.min(body, Math.floor(frame.width / 3)) : body;
}

function LegendRow({
  item,
  shown,
  onEnd,
}: {
  readonly item: TodayRing;
  readonly shown: boolean;
  readonly onEnd: (key: string, end: number) => void;
}): ReactNode {
  return (
    <View
      accessible={shown}
      aria-hidden={!shown}
      accessibilityLabel={ringSentence(item)}
      onLayout={(event) => {
        onEnd(item.key, event.nativeEvent.layout.y + event.nativeEvent.layout.height);
      }}
      className={cn('flex-row items-center gap-2', !shown && 'opacity-0')}
    >
      <View className={cn('size-2 rounded-full', RING_DOT[item.colour])} />
      <Text variant="caption" numberOfLines={2} className="tabular min-w-0 shrink">
        {item.name}: {item.done} of {item.goal}
      </Text>
    </View>
  );
}

function Legend({ rings }: { readonly rings: readonly TodayRing[] }): ReactNode {
  const [room, setRoom] = useState(Number.POSITIVE_INFINITY);
  const [ends, setEnds] = useState<Readonly<Record<string, number>>>({});
  const onEnd = (key: string, end: number): void => {
    setEnds((previous) => (previous[key] === end ? previous : { ...previous, [key]: end }));
  };
  return (
    <View
      className="min-h-0 min-w-0 flex-1 gap-1 self-stretch overflow-hidden"
      onLayout={(event) => {
        setRoom(event.nativeEvent.layout.height);
      }}
    >
      {rings.map((item) => (
        <LegendRow
          key={item.key}
          item={item}
          shown={(ends[item.key] ?? 0) <= room + SUBPIXEL}
          onEnd={onEnd}
        />
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
      <Text variant="caption" numberOfLines={1} className="min-w-0 shrink">
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

function Info({
  view,
  rings,
}: {
  readonly view: StatsView;
  readonly rings: readonly TodayRing[];
}): ReactNode {
  return (
    <View className="min-w-0 flex-1 gap-2 self-stretch">
      <Legend rings={rings} />
      <Streak view={view} />
    </View>
  );
}

function Body({ view }: { readonly view: StatsView }): ReactNode {
  const { cls, frame } = useWidgetFace();
  const rings = ringsWithClimb(view);
  const ring = <RingsOf rings={rings} size={progressRingPx(cls, frame)} />;
  const bars = <FitPlot>{(plot) => <WeekBars view={view} height={plot} />}</FitPlot>;
  if (cls === 'l') {
    return (
      <View className="flex-1 gap-3">
        <View className="flex-row gap-4">
          {ring}
          <Info view={view} rings={rings} />
        </View>
        {bars}
      </View>
    );
  }
  return (
    <View className="flex-1 flex-row gap-4">
      {ring}
      {cls === 'xl' ? <Info view={view} rings={rings} /> : <Legend rings={rings} />}
      {cls === 'w' || cls === 'xl' ? bars : null}
    </View>
  );
}

export function ProgressFace({ deviceId }: { readonly deviceId: string }): ReactNode {
  const stats = useTreadmillView(deviceId, 'stats', { range: 'week' });
  return <LoadedQuery query={stats}>{(view) => <Body view={view} />}</LoadedQuery>;
}
