import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  FadeIn,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { DURATION, EASING, entering, useMotion } from '../design/motion';
import { BottomSheet } from './bottom-sheet';
import { MenuRows, QuickRow, type MenuEntry, type MenuItem } from './menu-rows';

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

export function MenuPreview({ children }: { readonly children: ReactNode }): ReactNode {
  const motion = useMotion();
  const scale = useLiftScale();
  const lift = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <Animated.View
      {...entering(motion, FadeIn.duration(DURATION.short))}
      style={[{ maxHeight: PREVIEW_MAX_HEIGHT }, lift]}
      className="overflow-hidden"
    >
      <View pointerEvents="none">{children}</View>
    </Animated.View>
  );
}

export interface LiftMenuProps {
  readonly label: string;
  readonly header: ReactNode;
  readonly preview: ReactNode;
  readonly quick: readonly MenuItem[];
  readonly entries: readonly MenuEntry[];
  readonly onClose: () => void;
}

function LiftTop({ header, preview }: Pick<LiftMenuProps, 'header' | 'preview'>): ReactNode {
  if (header === null && preview === null) return null;
  return (
    <View pointerEvents="box-none" className="gap-2">
      {header}
      {preview === null ? null : <MenuPreview>{preview}</MenuPreview>}
    </View>
  );
}

export function LiftMenu({
  label,
  header,
  preview,
  quick,
  entries,
  onClose,
}: LiftMenuProps): ReactNode {
  return (
    <BottomSheet
      open
      onClose={onClose}
      label={label}
      detents={['fit']}
      compact
      preview={<LiftTop header={header} preview={preview} />}
    >
      {quick.length === 0 ? null : <QuickRow items={quick} close={onClose} subpages />}
      <MenuRows entries={entries} close={onClose} layout="compact" subpages />
    </BottomSheet>
  );
}
