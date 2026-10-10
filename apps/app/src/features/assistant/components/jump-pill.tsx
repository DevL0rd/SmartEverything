import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { exiting, useMotion } from '../../../design/motion';
import { Rise } from './rise';
import { PILL_OUT, RISE_PX } from './thread-motion';

export function JumpPill({
  unseen,
  onPress,
}: {
  readonly unseen: number;
  readonly onPress: () => void;
}): ReactNode {
  const motion = useMotion();
  const label = unseen > 0 ? `${String(unseen)} new` : 'Latest';
  return (
    <Animated.View
      {...exiting(motion, PILL_OUT)}
      pointerEvents="box-none"
      className="absolute inset-x-0 bottom-3 items-center"
    >
      <Rise from={RISE_PX.pill} duration={150}>
        <Interactive
          label={unseen > 0 ? `Jump to ${String(unseen)} new messages` : 'Jump to latest'}
          onPress={onPress}
          className="min-h-touch-min flex-row items-center gap-1.5 rounded-full border-hairline border-outline-variant bg-surface-raised px-4 elevation-2"
          layerClassName="rounded-full"
        >
          <Icon name="arrowDown" size={16} tone="primary" />
          <Text variant="label" className="tabular">
            {label}
          </Text>
        </Interactive>
      </Rise>
    </Animated.View>
  );
}

export function FloatingDay({ label }: { readonly label: string }): ReactNode {
  const motion = useMotion();
  return (
    <Animated.View
      {...exiting(motion, PILL_OUT)}
      pointerEvents="none"
      className="absolute inset-x-0 top-2 items-center"
    >
      <Rise from={RISE_PX.pill} duration={150}>
        <View className="rounded-full border-hairline border-outline-variant bg-surface-raised px-3 py-1 elevation-2">
          <Text variant="caption" tone="variant">
            {label}
          </Text>
        </View>
      </Rise>
    </Animated.View>
  );
}
