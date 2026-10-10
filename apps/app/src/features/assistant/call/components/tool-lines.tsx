import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Icon } from '../../../../components/icon';
import { Text } from '../../../../components/text';
import { entering, useMotion } from '../../../../design/motion';

export function ToolLines({ lines }: { readonly lines: readonly string[] }): ReactNode {
  const motion = useMotion();
  if (lines.length === 0) {
    return null;
  }
  return (
    <View className="flex-row flex-wrap justify-center gap-2 px-6">
      {lines.map((line, index) => (
        <Animated.View
          key={`${String(index)}-${line}`}
          {...entering(motion, FadeInDown)}
          className="flex-row items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5"
        >
          <Icon name="sparkles" size={16} tone="primary" />
          <Text variant="caption" tone="variant" numberOfLines={1}>
            {line}
          </Text>
        </Animated.View>
      ))}
    </View>
  );
}
