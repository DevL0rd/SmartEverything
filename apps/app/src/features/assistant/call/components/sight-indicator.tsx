import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import type { SightMode } from '@smarteverything/domain';
import { Icon } from '../../../../components/icon';
import { Interactive } from '../../../../components/interactive';
import { Text } from '../../../../components/text';
import { DURATION, useMotion } from '../../../../design/motion';
import type { CallSightStatus } from '../call-state';
import { sightPillText, stopSightLabel } from '../model/call-copy';

const PULSE_SCALE = 1.7;

function SightDot(): ReactNode {
  const motion = useMotion();
  const scale = useSharedValue(1);
  useEffect(() => {
    if (!motion.reduced) {
      scale.set(
        withSequence(
          withTiming(PULSE_SCALE, { duration: DURATION.long }),
          withTiming(1, { duration: DURATION.long }),
        ),
      );
    }
  }, [motion.reduced, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return <Animated.View style={style} className="size-2 rounded-full bg-critical" />;
}

export interface SightIndicatorProps {
  readonly sight: CallSightStatus;
  readonly mode: SightMode;
  readonly onStop: () => void;
}

export function SightIndicator({ sight, mode, onStop }: SightIndicatorProps): ReactNode {
  return (
    <View
      accessible={false}
      className="h-12 max-w-full flex-row items-center gap-2 rounded-full bg-critical/14 pl-3"
    >
      <SightDot />
      <Text variant="label" numberOfLines={1} className="shrink">
        {sightPillText(sight.source, sight.label, mode)}
      </Text>
      <Interactive
        onPress={onStop}
        label={stopSightLabel(sight.source, sight.label)}
        className="size-12 items-center justify-center rounded-full"
        layerClassName="rounded-full"
      >
        <View className="size-7 items-center justify-center rounded-full bg-critical">
          <Icon name="square" size={16} tone="onPrimary" />
        </View>
      </Interactive>
    </View>
  );
}
