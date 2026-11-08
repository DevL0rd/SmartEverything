import type { ReactNode, RefObject } from 'react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, findNodeHandle, Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cn } from '../design/cn';
import { DURATION, EASING, useMotion } from '../design/motion';
import { isNative, useIdiom } from '../design/platform';
import { useSizeClass } from '../design/size-class';
import { CHROME_SURFACE, FLOATING_SHEET_SURFACE, floatingSheetFrame } from './compact-panel';
import { FloatingSheetViewport } from './floating-sheet-viewport';
import { focusDecisionHeading } from './decision-keyboard';
import { HostedSheetPages, useHostedNativeBack } from './hosted-sheet-pages';
import { PullUpHandle, type PullUpHeights } from './pull-up-handle';
import { useSheetNavigation } from './sheet-navigation';
import { detentHeight, openingDetent, type OpenDetent, type PullUpDetent } from './pull-up-math';
import { useEscape } from './use-escape';

export interface PullUpPanelProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly label: string;
  readonly header: ReactNode;
  readonly onDetentChange?: (detent: OpenDetent) => void;
  readonly behindRef?: RefObject<View | null>;
  readonly children: ReactNode;
}

function currentOpener(): Element | null {
  return isNative() ? null : document.activeElement;
}

function useOpener(opener: Element | null): void {
  useLayoutEffect(() => {
    if (isNative()) {
      return undefined;
    }
    return (): void => {
      if (opener instanceof HTMLElement && opener.isConnected) {
        opener.focus();
      }
    };
  }, [opener]);
}

function useHeadingFocus(panel: RefObject<View | null>, id: string): void {
  useEffect(() => {
    if (!isNative()) {
      focusDecisionHeading(id);
      return;
    }
    const handle = findNodeHandle(panel.current);
    if (handle !== null) {
      AccessibilityInfo.setAccessibilityFocus(handle);
    }
  }, [panel, id]);
}

function useInert(behind: RefObject<View | null> | undefined): void {
  useEffect(() => {
    const node = behind?.current;
    if (isNative() || !(node instanceof HTMLElement)) {
      return undefined;
    }
    node.setAttribute('inert', '');
    return (): void => {
      node.removeAttribute('inert');
    };
  }, [behind]);
}

function useRise(
  open: boolean,
  detent: OpenDetent,
  heights: PullUpHeights,
  onClosed: () => void,
): void {
  const { reduced } = useMotion();
  const { host, height, settled } = heights;
  useEffect(() => {
    if (host === 0) {
      return;
    }
    const target = open ? detentHeight(detent, host) : 0;
    if (settled.get() === target) {
      return;
    }
    settled.set(target);
    const easing = open ? EASING.decelerate : EASING.accelerate;
    const duration = open ? DURATION.medium : DURATION.mediumOut;
    if (reduced) {
      height.set(target);
      if (!open) onClosed();
      return;
    }
    height.set(
      withTiming(target, { duration, easing }, (finished) => {
        'worklet';
        if (finished === true && target === 0) {
          scheduleOnRN(onClosed);
        }
      }),
    );
  }, [open, detent, host, reduced, height, settled, onClosed]);
}

function usePanelState(
  onClose: () => void,
  onDetentChange: PullUpPanelProps['onDetentChange'],
): { readonly detent: OpenDetent; readonly settle: (target: PullUpDetent) => void } {
  const short = useSizeClass().height === 'compact';
  const [detent, setDetent] = useState<OpenDetent>(() => openingDetent(short));
  return {
    detent,
    settle: (target): void => {
      if (target === 'peek') {
        onClose();
        return;
      }
      setDetent(target);
      onDetentChange?.(target);
    },
  };
}

interface SurfaceProps {
  readonly frame: ReturnType<typeof floatingSheetFrame> | null;
  readonly label: string;
  readonly header: ReactNode;
  readonly detent: OpenDetent;
  readonly heights: PullUpHeights;
  readonly settle: (target: PullUpDetent) => void;
  readonly children: ReactNode;
  readonly navigation: ReturnType<typeof useSheetNavigation> | null;
}

function SurfaceContent({
  label,
  header,
  detent,
  heights,
  settle,
  children,
  navigation,
}: Omit<SurfaceProps, 'frame'>): ReactNode {
  const content = useRef<View>(null);
  const contentId = `pull-up-${label}`;
  useHeadingFocus(content, contentId);
  const active = navigation?.pages.at(-1);
  const room = { paddingBottom: heights.host - detentHeight(detent, heights.host) };
  const root = useMemo(
    () => (
      <>
        {header}
        {children}
      </>
    ),
    [header, children],
  );
  return (
    <View
      ref={content}
      nativeID={contentId}
      role="region"
      accessibilityLabel={active?.page.title ?? label}
      className="flex-1"
    >
      <PullUpHandle
        label={label}
        detent={detent}
        heights={heights}
        settle={settle}
        nested={active !== undefined}
      />
      <View className="min-h-0 flex-1" style={room}>
        <HostedSheetPages navigation={navigation} label={label}>
          {root}
        </HostedSheetPages>
      </View>
    </View>
  );
}

function Surface({ frame, ...content }: SurfaceProps): ReactNode {
  const { host, height } = content.heights;
  const slide = useAnimatedStyle(() => ({ transform: [{ translateY: host - height.get() }] }));
  const surface = (
    <Animated.View
      style={[{ height: host }, slide]}
      className={cn(
        'absolute inset-x-0 bottom-0',
        frame === null
          ? 'overflow-hidden rounded-t-xl border-hairline border-b-0 border-outline-variant bg-surface-raised elevation-2'
          : cn(CHROME_SURFACE, FLOATING_SHEET_SURFACE),
      )}
    >
      <SurfaceContent {...content} />
    </Animated.View>
  );
  return frame === null ? (
    surface
  ) : (
    <FloatingSheetViewport frame={frame}>{surface}</FloatingSheetViewport>
  );
}

function PanelScrim({
  heights: { host, height },
  onClose,
}: {
  readonly heights: PullUpHeights;
  readonly onClose: () => void;
}): ReactNode {
  const shade = useAnimatedStyle(() => ({
    opacity: host === 0 ? 0 : Math.min(height.get() / (host / 2), 1),
  }));
  return (
    <>
      <Animated.View pointerEvents="none" style={shade} className="absolute inset-0 bg-scrim" />
      <Pressable
        accessible={false}
        focusable={false}
        onPress={onClose}
        className="absolute inset-0"
      />
    </>
  );
}

interface PanelProps extends PullUpPanelProps {
  readonly onClosed: () => void;
  readonly opener: Element | null;
}

function Panel({
  open,
  onClose,
  onClosed,
  opener,
  onDetentChange,
  behindRef,
  ...content
}: PanelProps): ReactNode {
  const touch = useIdiom() === 'touch';
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const frame = touch && size.height > 0 ? floatingSheetFrame(size, insets) : null;
  const host = frame?.maxHeight ?? size.height;
  const height = useSharedValue(0);
  const settled = useSharedValue(-1);
  const heights = { host, height, settled, onClosed };
  const navigation = useSheetNavigation(onClose);
  const back = touch ? navigation.back : onClose;
  const { detent, settle } = usePanelState(back, onDetentChange);
  const scope = useRef<View>(null);
  useOpener(opener);
  useInert(behindRef);
  useRise(open, detent, heights, onClosed);
  useEscape(open, back, scope);
  useHostedNativeBack(open && touch && navigation.pages.length > 0, back);
  return (
    <View
      ref={scope}
      pointerEvents="box-none"
      className="absolute inset-0 z-10 overflow-hidden"
      onLayout={(event) => {
        const { width, height: available } = event.nativeEvent.layout;
        setSize({ width, height: available });
      }}
    >
      <PanelScrim heights={heights} onClose={back} />
      <Surface
        {...content}
        frame={frame}
        navigation={touch ? navigation : null}
        detent={detent}
        heights={heights}
        settle={settle}
      />
    </View>
  );
}

interface Shown {
  readonly opener: Element | null;
}

export function PullUpPanel(props: PullUpPanelProps): ReactNode {
  const [shown, setShown] = useState<Shown | null>(() =>
    props.open ? { opener: currentOpener() } : null,
  );
  if (props.open && shown === null) {
    setShown({ opener: currentOpener() });
  }
  if (shown === null) {
    return null;
  }
  return (
    <Panel
      {...props}
      opener={shown.opener}
      onClosed={() => {
        setShown(null);
      }}
    />
  );
}
