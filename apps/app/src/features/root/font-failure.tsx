import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

export function FontFailure({ reason }: { readonly reason: string }): ReactNode {
  return (
    <View className="flex-1 items-center justify-center bg-bg p-6">
      <Text accessibilityRole="alert" className="text-center text-body text-on-surface">
        {`The app fonts did not load, so the interface cannot be drawn: ${reason}`}
      </Text>
    </View>
  );
}
