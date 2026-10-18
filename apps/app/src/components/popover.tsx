import type { ReactNode } from 'react';
import { ScrollView, View, useWindowDimensions, type ViewStyle } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { cn } from '../design/cn';
import { entering, useMotion } from '../design/motion';
import { placeAbove, placeNear, type Rect } from './anchor';
import { Overlay, useOverlayShown } from './overlay';

export interface PopoverProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly anchor: Rect | null;
  readonly label: string;
  readonly width?: number;
  readonly height?: number;
  readonly scroll?: boolean;
  readonly placement?: 'auto' | 'above';
  readonly className?: string;
  readonly children: ReactNode;
}

interface PanelProps {
  readonly label: string;
  readonly frame: ViewStyle;
  readonly scroll: boolean;
  readonly className: string | undefined;
  readonly children: ReactNode;
}

function PopoverPanel({ label, frame, className, children, scroll }: PanelProps): ReactNode {
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
      {scroll ? (
        <ScrollView contentContainerClassName="py-1">
          <View>{children}</View>
        </ScrollView>
      ) : (
        children
      )}
    </Animated.View>
  );
}

export interface PopoverFrameProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly label: string;
  readonly frame: Rect;
  readonly scrim?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}

export function PopoverFrame({
  open,
  onClose,
  label,
  frame,
  scrim = false,
  className,
  children,
}: PopoverFrameProps): ReactNode {
  const style = { left: frame.x, top: frame.y, width: frame.width, height: frame.height };
  return (
    <Overlay open={open} onClose={onClose} label={label} scrim={scrim}>
      <PopoverPanel label={label} frame={style} className={className} scroll={false}>
        {children}
      </PopoverPanel>
    </Overlay>
  );
}

export function Popover({
  open,
  onClose,
  anchor,
  label,
  width = 360,
  height,
  scroll = true,
  placement = 'auto',
  className,
  children,
}: PopoverProps): ReactNode {
  const window = useWindowDimensions();
  if (anchor === null) {
    return null;
  }
  const shown = Math.min(width, window.width - 16);
  const place =
    placement === 'above' ? placeAbove(anchor, shown, window) : placeNear(anchor, shown, window);
  const frame = {
    left: place.left,
    ...place.vertical,
    maxHeight: place.maxHeight,
    width: shown,
    ...(height === undefined ? {} : { height: Math.min(height, place.maxHeight) }),
  };
  return (
    <Overlay open={open} onClose={onClose} label={label} scrim={false}>
      <PopoverPanel label={label} frame={frame} className={className} scroll={scroll}>
        {children}
      </PopoverPanel>
    </Overlay>
  );
}
