import type { ReactNode } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { cn } from '../design/cn';
import { entering, useMotion } from '../design/motion';
import { placeBelow, type Rect } from './anchor';
import { Overlay } from './overlay';

export interface PopoverProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly anchor: Rect | null;
  readonly label: string;
  readonly width?: number;
  readonly className?: string;
  readonly children: ReactNode;
}

export function Popover({
  open,
  onClose,
  anchor,
  label,
  width = 360,
  className,
  children,
}: PopoverProps): ReactNode {
  const window = useWindowDimensions();
  const motion = useMotion();
  if (anchor === null) {
    return null;
  }
  const shown = Math.min(width, window.width - 16);
  const place = placeBelow(anchor, shown, window);
  const frame = { left: place.left, top: place.top, maxHeight: place.maxHeight, width: shown };
  return (
    <Overlay open={open} onClose={onClose} label={label} scrim={false}>
      <Animated.View
        {...entering(motion, FadeIn.duration(150))}
        accessibilityViewIsModal
        aria-modal
        accessibilityLabel={label}
        style={frame}
        className={cn(
          'absolute overflow-hidden rounded-md border-hairline border-outline-variant bg-surface-raised elevation-2',
          className,
        )}
      >
        <ScrollView contentContainerClassName="py-1">
          <View>{children}</View>
        </ScrollView>
      </Animated.View>
    </Overlay>
  );
}
