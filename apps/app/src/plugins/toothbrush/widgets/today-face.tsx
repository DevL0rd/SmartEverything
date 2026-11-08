import type { BrushStateView } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Rings } from '../../../components/charts';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import type { FrameClass, WidgetFrameBox } from '../../../components/widget-board';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import { cn } from '../../../design/cn';
import { SessionBarsChart } from '../charts/session-bars';
import { useBrushView } from '../data/brush-data';
import { barsLabel, sessionBars } from '../model/stats-model';
import { streakShort, todayRings } from '../model/today-model';
import { bodyHeightOf } from '../model/widget-model';
import { PrivateNote } from './private-note';

type Today = NonNullable<BrushStateView['today']>;

const STACK_GAP = 12;

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

export function showsChart(cls: FrameClass): boolean {
  return cls === 'w' || cls === 'l' || cls === 'xl';
}

function ringPxOf(cls: FrameClass, frame: WidgetFrameBox): number {
  const body = bodyHeightOf(frame);
  if (cls === 'l') {
    return Math.floor((body - STACK_GAP) / 2);
  }
  return cls === 'xl' ? Math.min(body, Math.floor(frame.width / 3)) : body;
}

function Legend({ today }: { readonly today: Today }): ReactNode {
  return (
    <View className="min-w-0 gap-1">
      {todayRings(today).map((ring) => (
        <View
          key={ring.label}
          accessible
          accessibilityLabel={ring.label}
          className="flex-row items-center gap-2"
        >
          <View className={cn('size-2 rounded-full', ring.dot)} />
          <Text variant="caption" numberOfLines={2} className="tabular min-w-0 shrink">
            {ring.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function WeekBars({
  deviceId,
  height,
}: {
  readonly deviceId: string;
  readonly height: number;
}): ReactNode {
  const stats = useBrushView(deviceId, 'stats', { range: 'week' });
  if (stats.data === undefined) {
    return null;
  }
  return (
    <SessionBarsChart
      chart={sessionBars(stats.data.stats)}
      label={barsLabel(stats.data.stats)}
      height={height}
    />
  );
}

function TodaySummary({
  today,
  streak,
  ringSize,
}: {
  readonly today: Today;
  readonly streak: number;
  readonly ringSize: number;
}): ReactNode {
  return (
    <View className="min-w-0 flex-row gap-4">
      <Rings size={ringSize} rings={todayRings(today)} />
      <View className="min-w-0 shrink gap-2">
        <Legend today={today} />
        <View className="flex-row items-center gap-2">
          <Icon name="flame" size={16} tone={streak > 0 ? 'warning' : 'faint'} />
          <Text variant="caption" numberOfLines={1} className="min-w-0 shrink">
            {streakShort(streak)}
          </Text>
        </View>
      </View>
    </View>
  );
}

function Body({
  deviceId,
  view,
  today,
}: {
  readonly deviceId: string;
  readonly view: BrushStateView;
  readonly today: Today;
}): ReactNode {
  const { cls, frame } = useWidgetFace();
  const chart = showsChart(cls);
  return (
    <View className={cn('flex-1 gap-4', cls === 'l' ? 'gap-3' : 'flex-row')}>
      <TodaySummary today={today} streak={view.streak ?? 0} ringSize={ringPxOf(cls, frame)} />
      {chart ? <FitPlot>{(plot) => <WeekBars deviceId={deviceId} height={plot} />}</FitPlot> : null}
    </View>
  );
}

export function TodayFace({
  deviceId,
  view,
}: {
  readonly deviceId: string;
  readonly view: BrushStateView;
}): ReactNode {
  if (!view.mine || view.today === null) {
    return <PrivateNote view={view} />;
  }
  return <Body deviceId={deviceId} view={view} today={view.today} />;
}
