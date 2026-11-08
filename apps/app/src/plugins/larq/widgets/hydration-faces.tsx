import type { BottleStats, BottleStatusView } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import type { FrameClass, WidgetFrameBox } from '../../../components/widget-board';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import { cn } from '../../../design/cn';
import { minutesOfDay } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import type { Device } from '../../../store/state';
import { SourceBars } from '../charts/source-bars';
import { HeatKey, Heatmap } from '../charts/heatmap';
import { WeekStrip } from '../charts/week-strip';
import { TodayRing } from '../components/today-ring';
import { useBottleView } from '../data/bottle-data';
import { paceOf } from '../model/bottle-model';
import { streakMarkOf } from '../model/calendar-model';
import { streakLine } from '../model/stats-model';
import { bodyHeightOf, goalsMetLine, monthLine } from '../model/widget-model';

const STACK_GAP = 12;

function FitPlot({
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

function ringPxOf(cls: FrameClass, frame: WidgetFrameBox): number {
  const body = bodyHeightOf(frame);
  if (cls === 'l') {
    return Math.floor((body - STACK_GAP) / 2);
  }
  return cls === 'xl' ? Math.min(body, Math.floor(frame.width / 3)) : body;
}

function PaceLine({
  view,
  wrap = false,
}: {
  readonly view: BottleStatusView;
  readonly wrap?: boolean;
}): ReactNode {
  const pace = paceOf(view.today, minutesOfDay(useMinute()));
  const tone = pace.expectedMl === 0 ? 'variant' : pace.deltaMl >= 0 ? 'positive' : 'warning';
  return (
    <Text variant="label" tone={tone} {...(wrap ? {} : { numberOfLines: 1 })}>
      {pace.text}
    </Text>
  );
}

function Notes({
  view,
  stats,
  goals,
}: {
  readonly view: BottleStatusView;
  readonly stats: BottleStats | undefined;
  readonly goals: boolean;
}): ReactNode {
  return (
    <View className="min-w-0 gap-1">
      <PaceLine view={view} wrap={goals} />
      {stats === undefined ? null : (
        <Text variant="footnote" tone="variant" {...(goals ? {} : { numberOfLines: 2 })}>
          {streakLine(stats.streak)}
        </Text>
      )}
      {goals && stats !== undefined ? (
        <Text variant="footnote" tone="variant">
          {goalsMetLine(stats.streak.completion30)}
        </Text>
      ) : null}
    </View>
  );
}

function Week({ stats }: { readonly stats: BottleStats | undefined }): ReactNode {
  return (
    <FitPlot>
      {(plot) =>
        stats === undefined ? (
          <Skeleton shape="block" className="h-12" />
        ) : (
          <WeekStrip bars={stats.bars} goalMl={stats.goalMl} height={plot} />
        )
      }
    </FitPlot>
  );
}

interface ProgressProps {
  readonly view: BottleStatusView;
  readonly stats: BottleStats | undefined;
  readonly minute: number;
  readonly ring: number;
}

function WidePanel({ view, stats, minute, ring }: ProgressProps): ReactNode {
  return (
    <View className="flex-1 flex-row gap-6">
      <TodayRing today={view.today} minuteOfDay={minute} size={ring} label />
      <View className="min-w-0 max-w-56 flex-1">
        <Notes view={view} stats={stats} goals />
      </View>
      <FitPlot className="flex-2">
        {(plot) =>
          stats === undefined ? (
            <Skeleton shape="block" className="h-24" />
          ) : (
            <SourceBars
              bars={stats.bars}
              range="week"
              goalMl={stats.goalMl}
              averages={null}
              height={plot}
            />
          )
        }
      </FitPlot>
    </View>
  );
}

function NarrowPanel({ view, stats, minute, ring }: ProgressProps): ReactNode {
  return (
    <View className="flex-1 gap-3">
      <View className="flex-row gap-4">
        <TodayRing today={view.today} minuteOfDay={minute} size={ring} label={false} />
        <View className="min-w-0 flex-1">
          <Notes view={view} stats={stats} goals />
        </View>
      </View>
      <Week stats={stats} />
    </View>
  );
}

function Strip({
  view,
  stats,
  minute,
  ring,
  row,
}: ProgressProps & { readonly row: boolean }): ReactNode {
  return (
    <View className="flex-1 flex-row gap-4">
      <TodayRing today={view.today} minuteOfDay={minute} size={ring} label={false} />
      {row ? (
        <View className="w-56">
          <Notes view={view} stats={stats} goals={false} />
        </View>
      ) : null}
      <View className="min-w-0 flex-1 gap-1">
        {row ? null : <PaceLine view={view} />}
        <Week stats={stats} />
      </View>
    </View>
  );
}

export function ProgressFace({
  view,
}: {
  readonly device: Device;
  readonly view: BottleStatusView;
}): ReactNode {
  const { cls, frame } = useWidgetFace();
  const stats = useBottleView(view.deviceId, 'stats', { range: 'week' }).data;
  const minute = minutesOfDay(useMinute());
  const props = { view, stats, minute, ring: ringPxOf(cls, frame) };
  if (cls === 'xl') {
    return <WidePanel {...props} />;
  }
  return cls === 'l' ? <NarrowPanel {...props} /> : <Strip {...props} row={cls === 'w'} />;
}

function CalendarNotes({
  stats,
  goals,
  onLayout,
}: {
  readonly stats: BottleStats;
  readonly goals: boolean;
  readonly onLayout?: (event: LayoutChangeEvent) => void;
}): ReactNode {
  return (
    <View className="min-w-0 gap-1" {...(onLayout === undefined ? {} : { onLayout })}>
      <Text variant="body-strong" numberOfLines={1}>
        {monthLine(stats.heatmap, stats.today)}
      </Text>
      <Text variant="footnote" tone="variant" numberOfLines={2}>
        {streakLine(stats.streak)}
      </Text>
      {goals ? (
        <Text variant="footnote" tone="variant" numberOfLines={1}>
          {goalsMetLine(stats.streak.completion30)}
        </Text>
      ) : null}
    </View>
  );
}

function Calendar({
  stats,
  height,
  keyed = true,
}: {
  readonly stats: BottleStats;
  readonly height: number;
  readonly keyed?: boolean;
}): ReactNode {
  return (
    <Heatmap
      keyed={keyed}
      heatmap={stats.heatmap}
      today={stats.today}
      streak={streakMarkOf(stats.streak, stats.today)}
      maxHeight={height}
    />
  );
}

function CalendarPanel({
  stats,
  body,
}: {
  readonly stats: BottleStats;
  readonly body: number;
}): ReactNode {
  const [notes, setNotes] = useState(0);
  return (
    <View className="flex-1 gap-3">
      <Calendar stats={stats} height={Math.max(0, body - notes - STACK_GAP)} />
      <CalendarNotes
        stats={stats}
        goals
        onLayout={(event) => {
          setNotes(Math.ceil(event.nativeEvent.layout.height));
        }}
      />
    </View>
  );
}

export function CalendarFace({
  view,
}: {
  readonly device: Device;
  readonly view: BottleStatusView;
}): ReactNode {
  const { cls, frame } = useWidgetFace();
  const stats = useBottleView(view.deviceId, 'stats', { range: 'year' }).data;
  if (stats === undefined) {
    return <Skeleton shape="block" className="h-24" />;
  }
  const body = bodyHeightOf(frame);
  if (cls === 'l' || cls === 'xl') {
    return <CalendarPanel stats={stats} body={body} />;
  }
  if (cls !== 'w') {
    return <Calendar stats={stats} height={body} />;
  }
  return (
    <View className="flex-1 flex-row gap-6">
      <View className="w-56 gap-3">
        <CalendarNotes stats={stats} goals={false} />
        <HeatKey />
      </View>
      <View className="min-w-0 flex-1">
        <Calendar stats={stats} height={body} keyed={false} />
      </View>
    </View>
  );
}
