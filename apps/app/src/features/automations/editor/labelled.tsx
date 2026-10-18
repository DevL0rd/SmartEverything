import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';

export function Labelled({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View className="items-start gap-1">
      <Text variant="footnote" tone="variant">
        {label}
      </Text>
      {children}
    </View>
  );
}
