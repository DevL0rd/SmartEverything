import type { BrushStateView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { Figure } from '../../../components/figure';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import { cn } from '../../../design/cn';
import { TrendChart } from '../charts/trend-chart';
import { useBrushView } from '../data/brush-data';
import { durationTrend, trendLabel } from '../model/stats-model';
import { scoreWord, streakShort } from '../model/today-model';
import { PrivateNote } from './private-note';
import { FitPlot, showsChart } from './today-face';

const ROUTINE_SECONDS = 120;

function ScoreSummary({
  score,
  streak,
  inline,
}: {
  readonly score: number | null;
  readonly streak: number;
  readonly inline: boolean;
}): ReactNode {
  return (
    <View className={cn('min-w-0 gap-2', inline && 'flex-row items-center gap-4')}>
      <Figure value={score === null ? '–' : String(score)} size="l" />
      <View className="min-w-0 shrink gap-1">
        <Badge label={scoreWord(score)} tone="primary" />
        <View className="flex-row items-center gap-1">
          <Icon name="flame" size={16} tone={streak > 0 ? 'warning' : 'faint'} />
          <Text variant="caption" numberOfLines={1} className="min-w-0 shrink">
            {streakShort(streak)}
          </Text>
        </View>
      </View>
    </View>
  );
}

function Trend({
  deviceId,
  height,
}: {
  readonly deviceId: string;
  readonly height: number;
}): ReactNode {
  const stats = useBrushView(deviceId, 'stats', { range: 'month' });
  if (stats.data === undefined) {
    return null;
  }
  return (
    <TrendChart
      trend={durationTrend(stats.data.stats)}
      target={stats.data.stats.goal.minimumSeconds ?? ROUTINE_SECONDS}
      label={trendLabel(stats.data.stats)}
      height={height}
    />
  );
}

function Body({
  deviceId,
  view,
}: {
  readonly deviceId: string;
  readonly view: BrushStateView;
}): ReactNode {
  const { cls } = useWidgetFace();
  const tall = cls === 'l';
  return (
    <View className={cn('flex-1', tall ? 'gap-3' : 'flex-row gap-4')}>
      <ScoreSummary score={view.score} streak={view.streak ?? 0} inline={cls !== 'xl'} />
      {showsChart(cls) ? (
        <FitPlot>{(plot) => <Trend deviceId={deviceId} height={plot} />}</FitPlot>
      ) : null}
    </View>
  );
}

export function StatsFace({
  deviceId,
  view,
}: {
  readonly deviceId: string;
  readonly view: BrushStateView;
}): ReactNode {
  if (!view.mine) {
    return <PrivateNote view={view} />;
  }
  return <Body deviceId={deviceId} view={view} />;
}
