import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { ScrollView, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import { useWindowSize } from '../design/size-class';
import Animated, { FadeIn } from 'react-native-reanimated';
import { cn } from '../design/cn';
import { entering, useMotion } from '../design/motion';
import { placeAbove, placeFitted, placeNear, type Rect } from './anchor';
import { CHROME_SURFACE, COMPACT_PANEL_INSET } from './compact-panel';
import type { FocusTarget } from './focus-request';
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
  readonly initialFocus?: RefObject<FocusTarget | null> | undefined;
  readonly children: ReactNode;
}

interface PanelProps {
  readonly frame: ViewStyle;
  readonly scroll: boolean;
  readonly className: string | undefined;
  readonly chrome: boolean;
  readonly onNatural?: (height: number) => void;
  readonly children: ReactNode;
}

interface NaturalHeight {
  readonly panel: (event: LayoutChangeEvent) => void;
  readonly viewport: (event: LayoutChangeEvent) => void;
  readonly content: (width: number, height: number) => void;
}

function useNaturalHeight(report: (height: number) => void): NaturalHeight {
  const sizes = useRef({ panel: 0, viewport: 0, content: 0 });
  const update = (): void => {
    const { panel, viewport, content } = sizes.current;
    if (viewport > 0 && content > 0) report(content + panel - viewport);
  };
  return {
    panel: (event): void => {
      sizes.current.panel = event.nativeEvent.layout.height;
      update();
    },
    viewport: (event): void => {
      sizes.current.viewport = event.nativeEvent.layout.height;
      update();
    },
    content: (_width, height): void => {
      sizes.current.content = height;
      update();
    },
  };
}

function ignoreHeight(): void {
  return undefined;
}

function PopoverPanel({
  frame,
  className,
  chrome,
  children,
  scroll,
  onNatural = ignoreHeight,
}: PanelProps): ReactNode {
  const motion = useMotion();
  const shown = useOverlayShown();
  const natural = useNaturalHeight(onNatural);
  return (
    <Animated.View
      {...entering(motion, FadeIn.duration(150))}
      onLayout={(event) => {
        shown();
        natural.panel(event);
      }}
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
          onLayout={natural.viewport}
          onContentSizeChange={natural.content}
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
  readonly initialFocus?: RefObject<FocusTarget | null> | undefined;
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
  initialFocus,
  children,
}: PopoverFrameProps): ReactNode {
  const window = useWindowSize();
  const vertical = fitContent
    ? fitVertical(frame, window.height, align)
    : { top: frame.y, height: frame.height };
  const style = { left: frame.x, width: frame.width, ...vertical };
  return (
    <Overlay open={open} onClose={onClose} label={label} scrim={scrim} initialFocus={initialFocus}>
      <PopoverPanel frame={style} className={className} chrome={chrome} scroll={scroll}>
        {children}
      </PopoverPanel>
    </Overlay>
  );
}

function placeOf({
  anchor,
  width,
  window,
  placement,
  measured,
}: {
  readonly anchor: Rect;
  readonly width: number;
  readonly window: { readonly width: number; readonly height: number };
  readonly placement: 'auto' | 'above';
  readonly measured: number | null;
}): ReturnType<typeof placeNear> {
  const prefer = placement === 'above' ? 'above' : 'below';
  if (measured !== null) return placeFitted(anchor, width, window, { height: measured, prefer });
  return placement === 'above'
    ? placeAbove(anchor, width, window)
    : placeNear(anchor, width, window);
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
  initialFocus,
  children,
}: PopoverProps): ReactNode {
  const window = useWindowSize();
  const [natural, setNatural] = useState<number | null>(null);
  if (anchor === null) {
    return null;
  }
  const shown = Math.min(width, window.width - 16);
  const place = placeOf({ anchor, width: shown, window, placement, measured: height ?? natural });
  const frame = {
    left: place.left,
    ...place.vertical,
    maxHeight: place.maxHeight,
    width: shown,
    ...(height === undefined ? {} : { height: Math.min(height, place.maxHeight) }),
  };
  return (
    <Overlay open={open} onClose={onClose} label={label} scrim={false} initialFocus={initialFocus}>
      <PopoverPanel
        frame={frame}
        className={className}
        chrome={chrome}
        scroll={scroll}
        onNatural={setNatural}
      >
        {children}
      </PopoverPanel>
    </Overlay>
  );
}
