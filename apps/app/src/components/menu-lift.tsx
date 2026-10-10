import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  FadeIn,
  type SharedValue,
  SlideInDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { cn } from '../design/cn';
import { DURATION, EASING, entering, useMotion } from '../design/motion';
import { MenuRows, QuickRow, type MenuEntry, type MenuItem } from './menu-rows';
import { Overlay, useOverlayShown } from './overlay';

const LIFT_SCALE = 1.02;
const PREVIEW_MAX_HEIGHT = 180;

function useLiftScale(): SharedValue<number> {
  const { reduced } = useMotion();
  const scale = useSharedValue(reduced ? LIFT_SCALE : 1);
  useEffect(() => {
    scale.set(
      reduced
        ? LIFT_SCALE
        : withTiming(LIFT_SCALE, { duration: DURATION.short, easing: EASING.standard }),
    );
  }, [reduced, scale]);
  return scale;
}

export type PreviewAlign = 'start' | 'end';

function Preview({
  align,
  children,
}: {
  readonly align: PreviewAlign;
  readonly children: ReactNode;
}): ReactNode {
  const motion = useMotion();
  const scale = useLiftScale();
  const lift = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <Animated.View
      {...entering(motion, FadeIn.duration(DURATION.short))}
      style={[{ maxHeight: PREVIEW_MAX_HEIGHT }, lift]}
      className={cn(
        'overflow-hidden rounded-xl bg-surface-1 elevation-3',
        align === 'end' ? 'self-end' : 'self-start',
      )}
    >
      <View pointerEvents="none">{children}</View>
    </Animated.View>
  );
}

export interface LiftMenuProps {
  readonly label: string;
  readonly preview: ReactNode;
  readonly previewAlign: PreviewAlign;
  readonly quick: readonly MenuItem[];
  readonly entries: readonly MenuEntry[];
  readonly onClose: () => void;
}

function LiftCard({
  quick,
  entries,
  onClose,
}: Pick<LiftMenuProps, 'quick' | 'entries' | 'onClose'>): ReactNode {
  const motion = useMotion();
  const shown = useOverlayShown();
  return (
    <Animated.View
      {...entering(motion, SlideInDown.duration(DURATION.medium))}
      onLayout={shown}
      className="mb-4 overflow-hidden rounded-xl bg-surface-raised elevation-3"
    >
      {quick.length === 0 ? null : <QuickRow items={quick} close={onClose} />}
      <View className="py-1">
        <MenuRows entries={entries} close={onClose} layout="sheet" />
      </View>
    </Animated.View>
  );
}

export function LiftMenu({
  label,
  preview,
  previewAlign,
  quick,
  entries,
  onClose,
}: LiftMenuProps): ReactNode {
  return (
    <Overlay open onClose={onClose} label={label} scrim className="justify-end">
      <View
        accessibilityViewIsModal
        aria-modal
        accessibilityLabel={label}
        className="gap-3 px-4 pb-safe"
      >
        {preview === null ? null : <Preview align={previewAlign}>{preview}</Preview>}
        <LiftCard quick={quick} entries={entries} onClose={onClose} />
      </View>
    </Overlay>
  );
}
