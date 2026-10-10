import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Text } from '../../../../components/text';
import { entering, useMotion } from '../../../../design/motion';
import type { CallView } from '../call-state';

export function CallCaptions({
  call,
  name,
}: {
  readonly call: CallView;
  readonly name: string;
}): ReactNode {
  const motion = useMotion();
  if (call.heard === '' && call.said === '') {
    return <View className="min-h-12 w-full" />;
  }
  return (
    <View className="w-full max-w-reading gap-1.5 self-center px-4">
      {call.heard === '' ? null : (
        <View className="flex-row items-baseline gap-2">
          <Text variant="caption" tone="variant" className="uppercase tracking-wide">
            You
          </Text>
          <Text variant="callout" tone="variant" numberOfLines={2} className="min-w-0 flex-1">
            {call.heard}
          </Text>
        </View>
      )}
      {call.said === '' ? null : (
        <Animated.View
          {...entering(motion, FadeIn)}
          accessibilityLiveRegion="polite"
          className="flex-row items-baseline gap-2"
        >
          <Text
            variant="caption"
            tone="variant"
            className="uppercase tracking-wide"
            numberOfLines={1}
          >
            {name}
          </Text>
          <Text variant="body" numberOfLines={4} className="min-w-0 flex-1">
            {call.said}
          </Text>
        </Animated.View>
      )}
    </View>
  );
}
