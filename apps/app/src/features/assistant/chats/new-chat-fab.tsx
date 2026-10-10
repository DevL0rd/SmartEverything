import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useIsFocused } from 'expo-router';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { useToastObstacle } from '../../../components/toast-obstacles';
import { cn } from '../../../design/cn';
import { DURATION, EASING, entering, exiting, useMotion } from '../../../design/motion';

const LABEL = 'New chat';

const SHRINK = LinearTransition.duration(DURATION.mediumOut).easing(EASING.standard);

export function NewChatFab({
  extended,
  onPress,
}: {
  readonly extended: boolean;
  readonly onPress: () => void;
}): ReactNode {
  const motion = useMotion();
  const { attach, onLayout } = useToastObstacle('bottom', useIsFocused());
  return (
    <View
      ref={attach}
      onLayout={onLayout}
      pointerEvents="box-none"
      className="absolute bottom-4 right-4"
    >
      <Animated.View {...(motion.reduced ? {} : { layout: SHRINK })}>
        <Interactive
          label={LABEL}
          onPress={onPress}
          onTone="primary"
          className={cn(
            'h-14 flex-row items-center justify-center gap-3 rounded-lg bg-primary elevation-3',
            extended ? 'px-5' : 'w-14',
          )}
          layerClassName="rounded-lg"
        >
          <Icon name="pencil" size={24} tone="onPrimary" />
          {extended ? (
            <Animated.View
              {...entering(motion, FadeIn.duration(DURATION.short))}
              {...exiting(motion, FadeOut.duration(DURATION.fast))}
            >
              <Text variant="label" tone="onPrimary" numberOfLines={1}>
                {LABEL}
              </Text>
            </Animated.View>
          ) : null}
        </Interactive>
      </Animated.View>
    </View>
  );
}
