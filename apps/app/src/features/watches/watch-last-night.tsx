import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Hypnogram } from '../../components/charts';
import { Text } from '../../components/text';
import { hoursMinutes } from '../../format/time';
import { useWatchNight } from './watch-health-data';

export function LastNightCard(): ReactNode {
  const night = useWatchNight();
  if (night === null) {
    return null;
  }
  return (
    <View className="gap-2">
      <Text variant="body-strong">Last night</Text>
      <View className="gap-2">
        <Hypnogram segments={night.segments} label="Sleep stages last night" />
        <Text variant="footnote" tone="variant" className="tabular">
          {`${hoursMinutes(night.asleepMinutes)} asleep`}
        </Text>
      </View>
    </View>
  );
}
