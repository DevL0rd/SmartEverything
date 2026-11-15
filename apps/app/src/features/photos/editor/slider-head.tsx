import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';

export function SliderHead({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): ReactNode {
  return (
    <View
      className="flex-row items-baseline justify-between"
      importantForAccessibility="no-hide-descendants"
    >
      <Text variant="label">{label}</Text>
      <Text variant="label" tone="variant" className="tabular-nums">
        {value}
      </Text>
    </View>
  );
}
