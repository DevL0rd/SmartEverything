import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Text } from '../../../../components/text';
import { entering, useMotion } from '../../../../design/motion';
import type { CallView } from '../call-state';

export function CallCaptions({ call }: { readonly call: CallView }): ReactNode {
  const motion = useMotion();
  return (
    <View className="min-h-24 w-full max-w-reading items-center gap-3 px-6">
      {call.heard === '' ? null : (
        <Text variant="callout" tone="variant" align="center" numberOfLines={2}>
          {call.heard}
        </Text>
      )}
      {call.said === '' ? null : (
        <Animated.View {...entering(motion, FadeIn)} accessibilityLiveRegion="polite">
          <Text variant="title-3" align="center" numberOfLines={4}>
            {call.said}
          </Text>
        </Animated.View>
      )}
    </View>
  );
}
