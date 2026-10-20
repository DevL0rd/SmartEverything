import type { BottleStatusView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { minutesOfDay } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useBottleView } from '../data/bottle-data';
import { insightsOf, type Insight } from '../model/insight-model';

function Chip({ insight }: { readonly insight: Insight }): ReactNode {
  return (
    <View className="max-w-full flex-row items-center gap-1.5 rounded-full border-hairline border-outline-variant bg-surface-2 px-3 py-1.5">
      <Icon
        name={insight.icon}
        size={16}
        tone={insight.tone === 'neutral' ? 'variant' : insight.tone}
      />
      <Text variant="footnote" numberOfLines={1} className="shrink">
        {insight.label}
      </Text>
    </View>
  );
}

export function InsightChips({
  view,
  skip = [],
}: {
  readonly view: BottleStatusView;
  readonly skip?: readonly string[];
}): ReactNode {
  const stats = useBottleView(view.deviceId, 'stats', { range: 'week' }).data;
  const insights = insightsOf(view, stats, minutesOfDay(useMinute())).filter(
    (insight) => !skip.includes(insight.key),
  );
  return insights.length === 0 ? null : (
    <View className="flex-row flex-wrap gap-2">
      {insights.map((insight) => (
        <Chip key={insight.key} insight={insight} />
      ))}
    </View>
  );
}
