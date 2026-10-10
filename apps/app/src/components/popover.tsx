import type { ReactNode } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { cn } from '../design/cn';
import { entering, useMotion } from '../design/motion';
import { placeNear, type Rect } from './anchor';
import { Overlay, useOverlayShown } from './overlay';

export interface PopoverProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly anchor: Rect | null;
  readonly label: string;
  readonly width?: number;
  readonly className?: string;
  readonly children: ReactNode;
}

interface PanelProps {
  readonly label: string;
  readonly frame: object;
  readonly className: string | undefined;
  readonly children: ReactNode;
}

function PopoverPanel({ label, frame, className, children }: PanelProps): ReactNode {
  const motion = useMotion();
  const shown = useOverlayShown();
  return (
    <Animated.View
      {...entering(motion, FadeIn.duration(150))}
      accessibilityViewIsModal
      aria-modal
      accessibilityLabel={label}
      onLayout={shown}
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
  );
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
  if (anchor === null) {
    return null;
  }
  const shown = Math.min(width, window.width - 16);
  const place = placeNear(anchor, shown, window);
  const frame = {
    left: place.left,
    ...place.vertical,
    maxHeight: place.maxHeight,
    width: shown,
  };
  return (
    <Overlay open={open} onClose={onClose} label={label} scrim={false}>
      <PopoverPanel label={label} frame={frame} className={className}>
        {children}
      </PopoverPanel>
    </Overlay>
  );
}
