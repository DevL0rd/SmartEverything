import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInLeft, SlideOutLeft } from 'react-native-reanimated';
import { cn } from '../design/cn';
import { DURATION, EASING, entering, exiting, useMotion } from '../design/motion';
import { DETAIL_MIN_WIDTH, useSizeClass } from '../design/size-class';
import { useEscape } from './use-escape';

const SLIDE_IN = SlideInLeft.duration(DURATION.medium).easing(EASING.standard);

const SLIDE_OUT = SlideOutLeft.duration(DURATION.medium).easing(EASING.standard);

const SCRIM_IN = FadeIn.duration(DURATION.medium);

const SCRIM_OUT = FadeOut.duration(DURATION.medium);

export interface MasterOverlay {
  readonly open: boolean;
  readonly onDismiss: () => void;
  readonly label: string;
}

export interface MasterDetailProps {
  readonly master: ReactNode;
  readonly detail: ReactNode;
  readonly masterWidth?: 'master' | 'popover';
  readonly overlay?: MasterOverlay;
  readonly split?: boolean;
}

export function OverlayPane({
  open,
  onDismiss,
  label,
  children,
}: MasterOverlay & { readonly children: ReactNode }): ReactNode {
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

export function MasterDetail({
  master,
  detail,
  masterWidth = 'master',
  overlay,
  split,
}: MasterDetailProps): ReactNode {
  const size = useSizeClass();
  const wide = split ?? size.split;
  const slides =
    !wide && overlay !== undefined && size.idiom === 'pointer' && size.area >= DETAIL_MIN_WIDTH;
  return (
    <View className={cn('flex-1', wide ? 'flex-row' : 'relative')}>
      {wide ? (
        <View
          className={cn(
            'border-r border-outline-variant',
            masterWidth === 'master' ? 'w-master' : 'w-popover',
          )}
        >
          {master}
        </View>
      ) : null}
      <View className="min-w-0 flex-1">{detail}</View>
      {slides ? <OverlayPane {...overlay}>{master}</OverlayPane> : null}
    </View>
  );
}
