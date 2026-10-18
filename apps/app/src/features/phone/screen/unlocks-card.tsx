import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { LiveFigure } from '../../../components/live-figure';
import { Text } from '../../../components/text';
import { decimal } from '../../../format/number';

export function UnlocksCard({
  unlocks,
  offline,
}: {
  readonly unlocks: number;
  readonly offline: boolean;
}): ReactNode {
  return (
    <Card title="Unlocks today" icon="lockOpen">
      <View className="flex-row items-baseline gap-3">
        <LiveFigure value={decimal(unlocks)} size="l" widest="888" stale={offline} />
        <Text variant="callout" tone="variant">
          {unlocks === 1 ? 'time' : 'times'}
        </Text>
      </View>
    </Card>
  );
}
