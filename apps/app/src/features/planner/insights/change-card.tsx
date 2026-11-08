import type { PlannerStats } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import type { DonutSlice } from '../../../components/charts';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { openQuickAskWith } from '../../assistant';
import { changeFactsOf, changePromptOf, changeTitleOf } from './summary-model';

export function ChangeCard({
  stats,
  slices,
}: {
  readonly stats: PlannerStats;
  readonly slices: readonly DonutSlice[];
}): ReactNode {
  const ask = (): void => {
    openQuickAskWith(changePromptOf(stats));
  };
  return (
    <Card className="bg-primary-container/40">
      <View className="flex-row items-center gap-2">
        <Icon name="sparkles" size={16} tone="primary" />
        <Text variant="label">{changeTitleOf(stats)}</Text>
      </View>
      <Text variant="footnote" tone="variant">
        {changeFactsOf(stats, slices)}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        <Button label="Ask what changed" variant="tonal" onPress={ask} />
      </View>
    </Card>
  );
}
