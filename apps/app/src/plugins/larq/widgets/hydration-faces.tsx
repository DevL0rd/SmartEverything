import type { BottleStats, BottleStatusView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
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

const WIDE_FROM = 560;
const PANEL_RING = 120;
const WIDE_RING = 168;
const CALENDAR_NOTES = 76;

function PaceLine({ view }: { readonly view: BottleStatusView }): ReactNode {
  const pace = paceOf(view.today, minutesOfDay(useMinute()));
  const tone = pace.expectedMl === 0 ? 'variant' : pace.deltaMl >= 0 ? 'positive' : 'warning';
  return (
    <Text variant="label" tone={tone} numberOfLines={1}>
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
      <PaceLine view={view} />
      {stats === undefined ? null : (
        <Text variant="footnote" tone="variant" numberOfLines={2}>
          {streakLine(stats.streak)}
        </Text>
      )}
      {goals && stats !== undefined ? (
        <Text variant="footnote" tone="variant" numberOfLines={1}>
          {goalsMetLine(stats.streak.completion30)}
        </Text>
      ) : null}
    </View>
  );
}

function Week({
  stats,
  height,
}: {
  readonly stats: BottleStats | undefined;
  readonly height: number;
}): ReactNode {
  return stats === undefined ? (
    <Skeleton shape="block" className="h-12" />
  ) : (
    <WeekStrip bars={stats.bars} goalMl={stats.goalMl} height={height} />
  );
}

interface ProgressProps {
  readonly view: BottleStatusView;
  readonly stats: BottleStats | undefined;
  readonly minute: number;
  readonly body: number;
}

function WidePanel({ view, stats, minute }: ProgressProps): ReactNode {
  return (
    <View className="flex-1 flex-row items-center gap-6">
      <TodayRing today={view.today} minuteOfDay={minute} size={WIDE_RING} label />
      <View className="w-56">
        <Notes view={view} stats={stats} goals />
      </View>
      <View className="min-w-0 flex-1">
        {stats === undefined ? (
          <Skeleton shape="block" className="h-24" />
        ) : (
          <SourceBars bars={stats.bars} range="week" goalMl={stats.goalMl} averages={null} />
        )}
      </View>
    </View>
  );
}

function NarrowPanel({ view, stats, minute, body }: ProgressProps): ReactNode {
  return (
    <View className="flex-1 gap-3">
      <View className="flex-row items-center gap-4">
        <TodayRing today={view.today} minuteOfDay={minute} size={PANEL_RING} label={false} />
        <View className="min-w-0 flex-1">
          <Notes view={view} stats={stats} goals />
        </View>
      </View>
      <Week stats={stats} height={Math.max(56, body - PANEL_RING - 12)} />
    </View>
  );
}

function Strip({
  view,
  stats,
  minute,
  body,
  row,
}: ProgressProps & { readonly row: boolean }): ReactNode {
  return (
    <View className="flex-1 flex-row items-center gap-4">
      <TodayRing today={view.today} minuteOfDay={minute} size={Math.min(body, 88)} label={false} />
      {row ? (
        <View className="w-56">
          <Notes view={view} stats={stats} goals={false} />
        </View>
      ) : null}
      <View className="min-w-0 flex-1 gap-1">
        {row ? null : <PaceLine view={view} />}
        <Week stats={stats} height={row ? body : body - 22} />
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
  const props = { view, stats, minute: minutesOfDay(useMinute()), body: bodyHeightOf(frame) };
  if (cls === 'l' || cls === 'xl') {
    return frame.width >= WIDE_FROM ? <WidePanel {...props} /> : <NarrowPanel {...props} />;
  }
  return <Strip {...props} row={cls === 'w'} />;
}

function CalendarNotes({
  stats,
  goals,
}: {
  readonly stats: BottleStats;
  readonly goals: boolean;
}): ReactNode {
  return (
    <View className="min-w-0 gap-1">
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
  const wide = frame.width >= WIDE_FROM;
  const panel = cls === 'xl' || cls === 'l';
  const heatmap = (height: number, keyed = true): ReactNode => (
    <Heatmap
      keyed={keyed}
      heatmap={stats.heatmap}
      today={stats.today}
      streak={streakMarkOf(stats.streak, stats.today)}
      maxHeight={height}
    />
  );
  if (!panel) {
    return wide ? (
      <View className="flex-1 flex-row items-center gap-6">
        <View className="w-56 gap-3">
          <CalendarNotes stats={stats} goals={false} />
          <HeatKey />
        </View>
        <View className="min-w-0 flex-1">{heatmap(body, false)}</View>
      </View>
    ) : (
      <View className="flex-1 justify-center">{heatmap(body)}</View>
    );
  }
  return (
    <View className="flex-1 justify-between gap-3">
      {heatmap(body - CALENDAR_NOTES)}
      <CalendarNotes stats={stats} goals />
    </View>
  );
}
