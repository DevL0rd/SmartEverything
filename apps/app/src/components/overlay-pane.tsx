import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInLeft, SlideOutLeft } from 'react-native-reanimated';
import { DURATION, EASING, entering, exiting, useMotion } from '../design/motion';
import { useEscape } from './use-escape';

const SLIDE_IN = SlideInLeft.duration(DURATION.medium).easing(EASING.standard);

const SLIDE_OUT = SlideOutLeft.duration(DURATION.medium).easing(EASING.standard);

const SCRIM_IN = FadeIn.duration(DURATION.medium);

const SCRIM_OUT = FadeOut.duration(DURATION.medium);

export interface OverlayPaneProps {
  readonly open: boolean;
  readonly onDismiss: () => void;
  readonly label: string;
  readonly children: ReactNode;
}

export function OverlayPane({ open, onDismiss, label, children }: OverlayPaneProps): ReactNode {
  const motion = useMotion();
  useEscape(open, onDismiss);
  if (!open) {
    return null;
  }
  return (
    <View className="absolute inset-0 z-20" pointerEvents="box-none">
      <Animated.View
        {...entering(motion, SCRIM_IN)}
        {...exiting(motion, SCRIM_OUT)}
        className="absolute inset-0"
      >
        <Pressable
          accessibilityLabel={`Close ${label}`}
          onPress={onDismiss}
          className="flex-1 bg-scrim"
        />
      </Animated.View>
      <Animated.View
        {...entering(motion, SLIDE_IN)}
        {...exiting(motion, SLIDE_OUT)}
        role="dialog"
        aria-label={label}
        className="absolute inset-y-0 left-0 w-master overflow-hidden border-r border-outline-variant bg-surface-raised elevation-2"
      >
        {children}
      </Animated.View>
    </View>
  );
}
