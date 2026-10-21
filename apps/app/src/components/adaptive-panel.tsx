import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { Keyboard, useWindowDimensions, type View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIdiom } from '../design/platform';
import {
  PANEL_SIZE,
  measureAnchor,
  placePanel,
  pointRect,
  settlePanel,
  type PanelPlacement,
  type PanelPresentation,
  type Rect,
} from './anchor';
import { BottomSheet } from './bottom-sheet';
import { PopoverFrame } from './popover';

export interface AdaptivePanelProps {
  readonly anchorRef: RefObject<View | null>;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly label: string;
  readonly fit?: boolean;
  readonly children: ReactNode;
}

export interface PanelFrame {
  readonly presentation: PanelPresentation;
  readonly width: number;
  readonly height: number;
}

const FrameContext = createContext<PanelFrame>({ presentation: 'popover', width: 0, height: 0 });

export function usePanelFrame(): PanelFrame {
  return useContext(FrameContext);
}

function observeAnchor(node: View | null, replace: () => void): () => void {
  if (
    typeof HTMLElement === 'undefined' ||
    typeof ResizeObserver === 'undefined' ||
    !(node instanceof HTMLElement)
  ) {
    return (): void => undefined;
  }
  const observer = new ResizeObserver(replace);
  observer.observe(node);
  return (): void => {
    observer.disconnect();
  };
}

function usePanelPlacement(anchorRef: RefObject<View | null>): PanelPlacement | null {
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const idiom = useIdiom();
  const [placement, setPlacement] = useState<PanelPlacement | null>(null);
  const place = useEffectEvent((anchor: Rect): void => {
    setPlacement((previous) =>
      settlePanel(previous, placePanel(anchor, PANEL_SIZE, { window, safeArea: insets, idiom })),
    );
  });
  const replace = useEffectEvent((): void => {
    if (anchorRef.current === null) place(pointRect(0, 0));
    else measureAnchor(anchorRef, place);
  });
  useEffect(() => {
    let frame: number | null = null;
    const schedule = (): void => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        replace();
      });
    };
    schedule();
    const shown = Keyboard.addListener('keyboardDidShow', schedule);
    const hidden = Keyboard.addListener('keyboardDidHide', schedule);
    const viewport =
      typeof globalThis.window === 'undefined' ? null : globalThis.window.visualViewport;
    viewport?.addEventListener('resize', schedule);
    const unobserve = observeAnchor(anchorRef.current, schedule);
    return (): void => {
      if (frame !== null) cancelAnimationFrame(frame);
      shown.remove();
      hidden.remove();
      viewport?.removeEventListener('resize', schedule);
      unobserve();
    };
  }, [anchorRef, window.width, window.height, insets.top, insets.bottom, idiom]);
  return placement;
}

export function AdaptivePanel({ open, ...props }: AdaptivePanelProps): ReactNode {
  return open ? <OpenPanel {...props} /> : null;
}

function OpenPanel({
  anchorRef,
  onClose,
  label,
  fit = false,
  children,
}: Omit<AdaptivePanelProps, 'open'>): ReactNode {
  const placement = usePanelPlacement(anchorRef);
  if (placement === null) return null;
  const { presentation, frame } = placement;
  const size: PanelFrame = { presentation, width: frame.width, height: frame.height };
  return (
    <FrameContext value={size}>
      {presentation === 'sheet' ? (
        <BottomSheet
          open
          onClose={onClose}
          title={label}
          label={label}
          detents={fit ? ['fit'] : ['full']}
          scroll={fit}
        >
          {children}
        </BottomSheet>
      ) : (
        <PopoverFrame
          open
          onClose={onClose}
          label={label}
          frame={frame}
          scrim={presentation === 'dialog'}
          className="rounded-lg"
        >
          {children}
        </PopoverFrame>
      )}
    </FrameContext>
  );
}
