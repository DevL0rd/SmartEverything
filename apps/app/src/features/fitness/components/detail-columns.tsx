import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSizeClass } from '../../../design/size-class';

export function DetailColumns({
  main,
  side,
}: {
  readonly main: ReactNode;
  readonly side: ReactNode;
}): ReactNode {
  const { split } = useSizeClass();
  if (!split) {
    return (
      <View className="gap-4">
        {main}
        {side}
      </View>
    );
  }
  return (
    <View className="flex-row gap-6">
      <View className="min-w-0 flex-2">{main}</View>
      <View className="min-w-0 flex-1 gap-3">{side}</View>
    </View>
  );
}
