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
  type PanelSize,
  type PointerPanelPlacement,
  type Rect,
} from './anchor';
import { BottomSheet } from './bottom-sheet';
import { PopoverFrame } from './popover';

export interface AdaptivePanelProps {
  readonly anchorRef: RefObject<View | null>;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onBack?: (() => void) | undefined;
  readonly label: string;
  readonly fit?: boolean;
  readonly compact?: boolean;
  readonly chrome?: boolean;
  readonly sheetFooter?: ReactNode;
  readonly scroll?: boolean;
  readonly pointerPlacement?: PointerPanelPlacement;
  readonly pointerSize?: PanelSize;
  readonly children: ReactNode;
}

export interface PanelFrame {
  readonly presentation: PanelPresentation;
  readonly width: number;
  readonly height: number;
}

const COMPACT_PANEL_SIZE: PanelSize = { width: 320, maxHeight: 400, minHeight: 120 };
const CHROME_PANEL_SIZE: PanelSize = { ...PANEL_SIZE, dialogWidth: PANEL_SIZE.width };

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

function usePanelPlacement(
  anchorRef: RefObject<View | null>,
  size: PanelSize,
  pointerPlacement: PointerPanelPlacement,
): PanelPlacement | null {
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const idiom = useIdiom();
  const [placement, setPlacement] = useState<PanelPlacement | null>(null);
  const place = useEffectEvent((anchor: Rect): void => {
    setPlacement((previous) =>
      settlePanel(
        previous,
        placePanel(anchor, size, { window, safeArea: insets, idiom, pointerPlacement }),
        pointerPlacement,
      ),
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
  }, [anchorRef, window.width, window.height, insets, idiom, size, pointerPlacement]);
  return placement;
}

export function AdaptivePanel({ open, ...props }: AdaptivePanelProps): ReactNode {
  return open ? <OpenPanel {...props} /> : null;
}

type PlacedPanelProps = Omit<AdaptivePanelProps, 'open' | 'anchorRef'> & {
  readonly placement: PanelPlacement;
};

function PlacedSheet({
  onClose,
  onBack,
  label,
  fit = false,
  chrome = false,
  sheetFooter,
  scroll,
  children,
}: PlacedPanelProps): ReactNode {
  return (
    <BottomSheet
      open
      onClose={onClose}
      onBack={onBack}
      title={chrome ? undefined : label}
      label={label}
      detents={fit ? ['fit'] : ['full']}
      scroll={scroll ?? fit}
      compact={fit}
      footer={sheetFooter}
    >
      {children}
    </BottomSheet>
  );
}

function PlacedPanel(props: PlacedPanelProps): ReactNode {
  const { presentation, frame } = props.placement;
  if (presentation === 'sheet') return <PlacedSheet {...props} />;
  const {
    compact,
    chrome = false,
    fit,
    pointerPlacement,
    scroll,
    onClose,
    label,
    children,
  } = props;
  return (
    <PopoverFrame
      open
      onClose={onClose}
      label={label}
      frame={frame}
      scrim={presentation === 'dialog'}
      fitContent={compact === true || (chrome && fit === true)}
      {...(scroll === undefined ? {} : { scroll })}
      align={pointerPlacement === 'below' || presentation === 'dialog' ? 'top' : 'bottom'}
      chrome={chrome}
      className="rounded-lg"
    >
      {children}
    </PopoverFrame>
  );
}

function OpenPanel({
  anchorRef,
  pointerSize,
  pointerPlacement = 'above',
  ...props
}: Omit<AdaptivePanelProps, 'open'>): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const panelSize =
    props.compact === true
      ? COMPACT_PANEL_SIZE
      : props.chrome === true
        ? CHROME_PANEL_SIZE
        : PANEL_SIZE;
  const placement = usePanelPlacement(
    anchorRef,
    pointer ? (pointerSize ?? panelSize) : panelSize,
    pointerPlacement,
  );
  if (placement === null) return null;
  const { presentation, frame } = placement;
  const size: PanelFrame = { presentation, width: frame.width, height: frame.height };
  return (
    <FrameContext value={size}>
      <PlacedPanel {...props} placement={placement} pointerPlacement={pointerPlacement} />
    </FrameContext>
  );
}
