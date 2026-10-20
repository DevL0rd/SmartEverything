import type { BrushStateView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Rings } from '../../../components/charts';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import { cn } from '../../../design/cn';
import { SessionBarsChart } from '../charts/session-bars';
import { useBrushView } from '../data/brush-data';
import { barsLabel, sessionBars } from '../model/stats-model';
import { streakShort, todayRings } from '../model/today-model';
import { bodyHeightOf, ringPxOf } from '../model/widget-model';
import { PrivateNote } from './private-note';

type Today = NonNullable<BrushStateView['today']>;

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
          <Text variant="caption" numberOfLines={1} className="tabular min-w-0 shrink">
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
  const body = bodyHeightOf(frame);
  const wide = cls === 'w' || cls === 'xl';
  const streak = view.streak ?? 0;
  return (
    <View className="flex-1 flex-row items-center gap-4">
      <Rings size={ringPxOf(body)} rings={todayRings(today)} />
      <View className="min-w-0 flex-1 gap-2">
        <Legend today={today} />
        {cls === 'm' || cls === 'xs' || cls === 's' ? null : (
          <View className="flex-row items-center gap-2">
            <Icon name="flame" size={16} tone={streak > 0 ? 'warning' : 'faint'} />
            <Text variant="caption" numberOfLines={1}>
              {streakShort(streak)}
            </Text>
          </View>
        )}
      </View>
      {wide ? (
        <View className="min-w-0 flex-1">
          <WeekBars deviceId={deviceId} height={Math.max(48, body - 40)} />
        </View>
      ) : null}
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
