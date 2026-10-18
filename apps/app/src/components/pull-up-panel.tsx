import type { ReactNode, RefObject } from 'react';
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
import { AccessibilityInfo, findNodeHandle, Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { cn } from '../design/cn';
import { DURATION, EASING, SPRING, useMotion } from '../design/motion';
import { isNative, useIdiom } from '../design/platform';
import { useSizeClass } from '../design/size-class';
import { focusDecisionHeading } from './decision-keyboard';
import { Interactive } from './interactive';
import {
  cycleDetent,
  detentHeight,
  dragPlan,
  openingDetent,
  snapDetent,
  stepDetent,
  type OpenDetent,
  type PullUpDetent,
} from './pull-up-math';
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

interface Heights {
  readonly host: number;
  readonly height: SharedValue<number>;
  readonly settled: SharedValue<number>;
  readonly onClosed: () => void;
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

function useRise(open: boolean, detent: OpenDetent, heights: Heights, onClosed: () => void): void {
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

function useHandleDrag(
  heights: Heights,
  settle: (target: PullUpDetent) => void,
): ReturnType<typeof Gesture.Pan> {
  const { host, height, settled, onClosed } = heights;
  const start = useSharedValue(0);
  return Gesture.Pan()
    .onBegin(() => {
      start.set(height.get());
    })
    .onUpdate((event) => {
      height.set(Math.min(Math.max(start.get() - event.translationY, 0), host));
    })
    .onEnd((event) => {
      const target = snapDetent(height.get(), event.velocityY, host);
      const { rest, closes } = dragPlan(target, host);
      settled.set(rest);
      if (closes) {
        height.set(
          withTiming(
            rest,
            { duration: DURATION.mediumOut, easing: EASING.accelerate },
            (finished) => {
              'worklet';
              if (finished === true) {
                scheduleOnRN(onClosed);
              }
            },
          ),
        );
      } else {
        height.set(withSpring(rest, { ...SPRING, velocity: -event.velocityY }));
      }
      scheduleOnRN(settle, target);
    });
}

function useHandleKeys(
  node: RefObject<View | null>,
  current: OpenDetent,
  settle: (target: PullUpDetent) => void,
): void {
  const press = useEffectEvent((key: string) => {
    if (key === 'ArrowUp') settle(stepDetent(current, 'taller'));
    if (key === 'ArrowDown') settle(stepDetent(current, 'shorter'));
  });
  useEffect(() => {
    const root = node.current;
    if (isNative() || !(root instanceof HTMLElement)) {
      return undefined;
    }
    const listen = (event: KeyboardEvent): void => {
      if (
        event.key.startsWith('Arrow') &&
        event.target instanceof Node &&
        root.contains(event.target)
      ) {
        event.preventDefault();
        press(event.key);
      }
    };
    root.addEventListener('keydown', listen);
    return (): void => {
      root.removeEventListener('keydown', listen);
    };
  }, [node]);
}

interface HandleProps {
  readonly label: string;
  readonly detent: OpenDetent;
  readonly heights: Heights;
  readonly settle: (target: PullUpDetent) => void;
}

function Handle({ label, detent, heights, settle }: HandleProps): ReactNode {
  const touch = useIdiom() === 'touch';
  const node = useRef<View>(null);
  const drag = useHandleDrag(heights, settle);
  useHandleKeys(node, detent, settle);
  return (
    <GestureDetector gesture={drag}>
      <View ref={node} collapsable={false}>
        <Interactive
          label={`${label} height`}
          hint="Press Enter to change the height. Arrow keys resize."
          onPress={() => {
            settle(cycleDetent(detent));
          }}
          className={cn('w-full items-center justify-center', touch ? 'h-touch-min' : 'h-6')}
        >
          <View className="h-1 w-11 rounded-full bg-on-surface-faint" />
        </Interactive>
      </View>
    </GestureDetector>
  );
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
  readonly label: string;
  readonly header: ReactNode;
  readonly detent: OpenDetent;
  readonly heights: Heights;
  readonly settle: (target: PullUpDetent) => void;
  readonly children: ReactNode;
}

function Surface({ label, header, detent, heights, settle, children }: SurfaceProps): ReactNode {
  const { host, height } = heights;
  const content = useRef<View>(null);
  const contentId = `pull-up-${label}`;
  useHeadingFocus(content, contentId);
  const slide = useAnimatedStyle(() => ({ transform: [{ translateY: host - height.get() }] }));
  const size = { height: host };
  const room = { paddingBottom: host - detentHeight(detent, host) };
  return (
    <Animated.View
      style={[size, slide]}
      className="absolute inset-x-0 bottom-0 overflow-hidden rounded-t-xl border-hairline border-b-0 border-outline-variant bg-surface-raised elevation-2"
    >
      <View
        ref={content}
        nativeID={contentId}
        role="region"
        accessibilityLabel={label}
        className="flex-1"
      >
        <Handle label={label} detent={detent} heights={heights} settle={settle} />
        {header}
        <View className="flex-1" style={room}>
          {children}
        </View>
      </View>
    </Animated.View>
  );
}

function Panel({
  open,
  onClose,
  onClosed,
  opener,
  label,
  header,
  onDetentChange,
  behindRef,
  children,
}: PullUpPanelProps & {
  readonly onClosed: () => void;
  readonly opener: Element | null;
}): ReactNode {
  const [host, setHost] = useState(0);
  const height = useSharedValue(0);
  const settled = useSharedValue(-1);
  const heights = { host, height, settled, onClosed };
  const { detent, settle } = usePanelState(onClose, onDetentChange);
  const scope = useRef<View>(null);
  useOpener(opener);
  useInert(behindRef);
  useRise(open, detent, heights, onClosed);
  useEscape(open, onClose, scope);
  const shade = useAnimatedStyle(() => ({
    opacity: host === 0 ? 0 : Math.min(height.get() / (host / 2), 1),
  }));
  return (
    <View
      ref={scope}
      pointerEvents="box-none"
      className="absolute inset-0 z-10 overflow-hidden"
      onLayout={(event) => {
        setHost(event.nativeEvent.layout.height);
      }}
    >
      <Animated.View pointerEvents="none" style={shade} className="absolute inset-0 bg-scrim" />
      <Pressable
        accessible={false}
        focusable={false}
        onPress={onClose}
        className="absolute inset-0"
      />
      <Surface label={label} header={header} detent={detent} heights={heights} settle={settle}>
        {children}
      </Surface>
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
