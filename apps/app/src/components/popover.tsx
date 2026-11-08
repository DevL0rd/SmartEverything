import type { ReactNode } from 'react';
import { ScrollView, View, useWindowDimensions, type ViewStyle } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { cn } from '../design/cn';
import { entering, useMotion } from '../design/motion';
import { placeAbove, placeNear, type Rect } from './anchor';
import { CHROME_SURFACE, COMPACT_PANEL_INSET } from './compact-panel';
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
  readonly chrome?: boolean;
  readonly children: ReactNode;
}

interface PanelProps {
  readonly frame: ViewStyle;
  readonly scroll: boolean;
  readonly className: string | undefined;
  readonly chrome: boolean;
  readonly children: ReactNode;
}

function PopoverPanel({ frame, className, chrome, children, scroll }: PanelProps): ReactNode {
  const motion = useMotion();
  const shown = useOverlayShown();
  return (
    <Animated.View
      {...entering(motion, FadeIn.duration(150))}
      onLayout={shown}
      style={frame}
      className={cn(
        'absolute overflow-hidden elevation-2',
        chrome
          ? cn(CHROME_SURFACE, 'rounded-lg')
          : 'rounded-md border-hairline border-outline-variant bg-surface-raised',
        className,
      )}
    >
      {scroll ? (
        <ScrollView
          {...(chrome ? { className: 'min-h-0 shrink' } : {})}
          contentContainerClassName={cn('py-1', chrome && COMPACT_PANEL_INSET)}
        >
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
  readonly fitContent?: boolean;
  readonly scroll?: boolean;
  readonly align?: 'top' | 'bottom';
  readonly className?: string;
  readonly chrome?: boolean;
  readonly children: ReactNode;
}

function fitVertical(frame: Rect, windowHeight: number, align: 'top' | 'bottom'): ViewStyle {
  if (align === 'top') return { top: frame.y, maxHeight: frame.height };
  return { bottom: windowHeight - frame.y - frame.height, maxHeight: frame.height };
}

export function PopoverFrame({
  open,
  onClose,
  label,
  frame,
  scrim = false,
  fitContent = false,
  scroll = fitContent,
  align = scrim ? 'top' : 'bottom',
  className,
  chrome = false,
  children,
}: PopoverFrameProps): ReactNode {
  const window = useWindowDimensions();
  const vertical = fitContent
    ? fitVertical(frame, window.height, align)
    : { top: frame.y, height: frame.height };
  const style = { left: frame.x, width: frame.width, ...vertical };
  return (
    <Overlay open={open} onClose={onClose} label={label} scrim={scrim}>
      <PopoverPanel frame={style} className={className} chrome={chrome} scroll={scroll}>
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
  chrome = false,
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
      <PopoverPanel frame={frame} className={className} chrome={chrome} scroll={scroll}>
        {children}
      </PopoverPanel>
    </Overlay>
  );
}
