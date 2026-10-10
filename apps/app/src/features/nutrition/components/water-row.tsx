import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Text } from '../../../components/text';
import { useAddGlass } from '../data/water';
import { useWaterGoal } from '../data/water-goal';
import { WaterGlass } from './water-glass';
import { litres, millilitres } from '../../../format/number';

export function GlassButton({
  day,
  today,
  grow = false,
}: {
  readonly day: string;
  readonly today: string;
  readonly grow?: boolean;
}): ReactNode {
  const glass = useAddGlass(day, today);
  if (glass.ml === null) {
    return null;
  }
  return (
    <Button
      label={`Glass · ${millilitres(glass.ml)}`}
      icon="plus"
      variant="tonal"
      grow={grow}
      onPress={glass.add}
      hint={`Add ${String(glass.ml)} ml of water`}
    />
  );
}

export function WaterRow({
  litresDrunk,
  day,
  today,
}: {
  readonly litresDrunk: number;
  readonly day: string;
  readonly today: string;
}): ReactNode {
  const goal = useWaterGoal();
  const drunk = litresDrunk * 1000;
  return (
    <View className="flex-row flex-wrap items-center gap-4">
      <WaterGlass progress={drunk / goal.ml} size="m" />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="body-strong" numberOfLines={1}>
          {`${litres(drunk)} water`}
        </Text>
        <Text variant="footnote" tone="variant" numberOfLines={1}>
          {`of ${litres(goal.ml)}`}
        </Text>
      </View>
      <GlassButton day={day} today={today} />
    </View>
  );
}
