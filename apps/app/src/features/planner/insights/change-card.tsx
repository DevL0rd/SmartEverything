import type { PlannerStats } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import type { DonutSlice } from '../../../components/charts';
import { Text } from '../../../components/text';
import { askAssistantWith } from '../../assistant';
import { changeFactsOf, changePromptOf, changeTitleOf } from './summary-model';

export function ChangeCard({
  stats,
  slices,
}: {
  readonly stats: PlannerStats;
  readonly slices: readonly DonutSlice[];
}): ReactNode {
  const ask = (): void => {
    askAssistantWith(changePromptOf(stats));
  };
  return (
    <Card title={changeTitleOf(stats)} icon="sparkles" className="grow">
      <Text variant="footnote" tone="variant">
        {changeFactsOf(stats, slices)}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        <Button label="Ask what changed" variant="tonal" onPress={ask} />
      </View>
    </Card>
  );
}
