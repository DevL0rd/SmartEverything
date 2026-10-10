import type { ReactNode } from 'react';
import { Image, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Icon } from '../../../../components/icon';
import { Text } from '../../../../components/text';
import { entering, useMotion } from '../../../../design/motion';
import type { CallLook } from '../call-state';
import { lookedAtText, sourceIconOf } from '../model/call-copy';

export function LookedChip({ look }: { readonly look: CallLook }): ReactNode {
  const motion = useMotion();
  return (
    <Animated.View
      {...entering(motion, FadeIn)}
      accessibilityLiveRegion="polite"
      className="h-9 max-w-full flex-row items-center gap-2 self-center rounded-full bg-surface-2/90 pl-1.5 pr-3"
    >
      <View className="h-6 w-9 items-center justify-center overflow-hidden rounded-xs bg-surface-3">
        {look.picture === null ? (
          <Icon name={sourceIconOf(look.source)} size={16} tone="variant" />
        ) : (
          <Image
            source={{ uri: `data:image/jpeg;base64,${look.picture}` }}
            accessibilityIgnoresInvertColors
            className="size-full"
          />
        )}
      </View>
      <Text variant="caption" numberOfLines={1}>
        {lookedAtText(look.label)}
      </Text>
    </Animated.View>
  );
}
