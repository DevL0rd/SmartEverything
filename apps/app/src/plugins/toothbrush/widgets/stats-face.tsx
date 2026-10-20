import type { BrushStateView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { Figure } from '../../../components/figure';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import { heightStyle } from '../charts/style';
import { TrendChart } from '../charts/trend-chart';
import { useBrushView } from '../data/brush-data';
import { durationTrend, trendLabel } from '../model/stats-model';
import { scoreWord, streakShort } from '../model/today-model';
import { bodyHeightOf } from '../model/widget-model';
import { PrivateNote } from './private-note';

function Body({
  deviceId,
  view,
}: {
  readonly deviceId: string;
  readonly view: BrushStateView;
}): ReactNode {
  const { cls, frame } = useWidgetFace();
  const stats = useBrushView(deviceId, 'stats', { range: 'month' });
  const streak = view.streak ?? 0;
  const wide = cls === 'w' || cls === 'xl';
  return (
    <View className="flex-1 flex-row items-center gap-4">
      <View className="min-w-0 gap-2">
        <Figure value={view.score === null ? '–' : String(view.score)} size="l" />
        <Badge label={scoreWord(view.score)} tone="primary" />
        <View className="flex-row items-center gap-1">
          <Icon name="flame" size={16} tone={streak > 0 ? 'warning' : 'faint'} />
          <Text variant="caption" numberOfLines={1}>
            {streakShort(streak)}
          </Text>
        </View>
      </View>
      {wide && stats.data !== undefined ? (
        <View className="min-w-0 flex-1" style={heightStyle(Math.max(80, bodyHeightOf(frame)))}>
          <TrendChart
            trend={durationTrend(stats.data.stats)}
            target={stats.data.stats.goal.minimumSeconds ?? 120}
            label={trendLabel(stats.data.stats)}
          />
        </View>
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
