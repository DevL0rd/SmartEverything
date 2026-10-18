import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { Text } from '../../../components/text';
import { signalWord, type NetworkSection } from './network-model';
import { SignalMeter } from './signal-meter';

export function MobileCard({
  cellular,
  offline,
}: {
  readonly cellular: NonNullable<NetworkSection['cellular']>;
  readonly offline: boolean;
}): ReactNode {
  const bars = offline ? 0 : cellular.bars;
  const title = [cellular.operator, cellular.generation.toUpperCase()]
    .filter((part) => part !== null)
    .join(' · ');
  return (
    <Card title="Mobile" icon="signal">
      <View className="flex-row items-center gap-3">
        <SignalMeter bars={bars} name="Mobile" />
        <View className="min-w-0 flex-1">
          <Text variant="callout" numberOfLines={1}>
            {title}
          </Text>
          <Text variant="footnote" tone="variant">
            {offline ? 'No reading while offline' : signalWord(bars)}
          </Text>
        </View>
      </View>
    </Card>
  );
}
