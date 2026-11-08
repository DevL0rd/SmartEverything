import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../../components/text';

export function RunFailure({ error }: { readonly error: string | null }): ReactNode {
  if (error === null) return null;
  return (
    <View className="gap-1">
      <Text variant="body-strong" tone="critical" accessibilityRole="header">
        Run error
      </Text>
      <Text variant="footnote">{error}</Text>
    </View>
  );
}
