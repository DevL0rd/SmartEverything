import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';

export function OffPanel({
  onStart,
  offline,
}: {
  readonly onStart: () => void;
  readonly offline: boolean;
}): ReactNode {
  return (
    <View className="items-center gap-3 py-4">
      <View className="size-16 items-center justify-center rounded-full bg-surface-3">
        <Icon name="moonStar" size={32} colour="sleep-deep" />
      </View>
      <Text variant="title-3" align="center">
        Plan your nights
      </Text>
      <Text variant="callout" tone="variant" align="center" className="max-w-100">
        Pick when you go to bed and wake up. A reminder, a calm wind-down and Do not disturb follow
        the plan, and your alarm wakes you.
      </Text>
      <Button label="Turn on bedtime" icon="moon" disabled={offline} onPress={onStart} />
    </View>
  );
}

export function NoNightsPanel({
  onAdd,
  offline,
}: {
  readonly onAdd: () => void;
  readonly offline: boolean;
}): ReactNode {
  return (
    <View className="items-center gap-3 py-4">
      <View className="size-16 items-center justify-center rounded-full bg-surface-3">
        <Icon name="moonStar" size={32} colour="sleep-deep" />
      </View>
      <Text variant="title-3" align="center">
        No nights planned
      </Text>
      <Text variant="callout" tone="variant" align="center" className="max-w-100">
        Bedtime is on. Add the nights you want to plan, with when you go to bed and wake up.
      </Text>
      <Button label="Add nights" icon="plus" disabled={offline} onPress={onAdd} />
    </View>
  );
}
