import type { ReactNode } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Animated, { SlideInRight } from 'react-native-reanimated';
import { Sheet } from '../../../../components/sheet';
import { entering, useMotion } from '../../../../design/motion';
import type { CallView } from '../call-state';
import { CallSettingsBody } from './call-settings-body';

export interface CallSettingsProps {
  readonly open: boolean;
  readonly call: CallView;
  readonly onClose: () => void;
}

const SHORT_HEIGHT = 560;

export function CallSettingsSheet({ open, call, onClose }: CallSettingsProps): ReactNode {
  const { height } = useWindowDimensions();
  return (
    <Sheet
      open={open}
      onClose={onClose}
      label="Call settings"
      kind="inspector"
      detents={height < SHORT_HEIGHT ? ['full'] : ['half', 'full']}
      scroll={false}
    >
      <CallSettingsBody call={call} onClose={onClose} />
    </Sheet>
  );
}

export function CallSettingsPanel({ open, call, onClose }: CallSettingsProps): ReactNode {
  const motion = useMotion();
  if (!open) {
    return null;
  }
  return (
    <Animated.View
      {...entering(motion, SlideInRight.duration(250))}
      accessibilityLabel="Call settings"
      className="h-full w-inspector max-w-full border-l-hairline border-outline-variant bg-surface-1 pt-4"
    >
      <View className="min-h-0 flex-1">
        <CallSettingsBody call={call} onClose={onClose} />
      </View>
    </Animated.View>
  );
}
