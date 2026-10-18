import type { RefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useWindowDimensions, type View } from 'react-native';
import { useAnimatedReaction, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useScreen } from '../components/screen-context';
import { useInsideOverlay } from '../components/overlay-shown';
import { useScreenLive, type ScreenLive } from './animation-gate';
import type { ViewportOptions, ViewportVisibility } from './viewport';
import { ViewportRegistry, type ViewportMembership } from './viewport-registry';

const SCROLL_STEP = 24;

export function useScreenViewport(scrollY: SharedValue<number>): ViewportRegistry {
  const watching = useSharedValue(false);
  const size = useWindowDimensions();
  const [registry] = useState(
    () =>
      new ViewportRegistry(size, (next) => {
        watching.set(next);
      }),
  );
  const deliver = useCallback(
    (offset: number): void => {
      registry.scrolled(offset);
    },
    [registry],
  );
  useEffect(() => {
    registry.resized(size);
  }, [registry, size]);
  useEffect(
    () => (): void => {
      registry.dispose();
    },
    [registry],
  );
  useAnimatedReaction(
    () => (watching.get() ? Math.round(scrollY.get() / SCROLL_STEP) : null),
    (step, previous) => {
      if (step !== null && step !== previous) scheduleOnRN(deliver, scrollY.get());
    },
    [deliver],
  );
  return registry;
}

export function useViewport(
  ref: RefObject<View | null>,
  options: ViewportOptions = {},
): ViewportVisibility {
  return useLiveViewport(ref, options, useScreenLive());
}

export function useLiveViewport(
  ref: RefObject<View | null>,
  { margin = 0, tracking = true }: ViewportOptions,
  { focused, foreground }: ScreenLive,
): ViewportVisibility {
  const [visible, setVisible] = useState(true);
  const { scrollable, viewport } = useScreen();
  const overlay = useInsideOverlay();
  const tracked = scrollable && !overlay && tracking;
  const enabled = tracked && focused && foreground;
  const membership = useRef<ViewportMembership | null>(null);
  useEffect(() => {
    if (!enabled) return undefined;
    const joined = viewport.join({ ref, margin, change: setVisible });
    membership.current = joined;
    return (): void => {
      joined.leave();
      membership.current = null;
    };
  }, [viewport, ref, margin, enabled]);
  const onLayout = useCallback((): void => {
    membership.current?.measure();
  }, []);
  return { onLayout: tracked ? onLayout : undefined, visible: !tracked || visible };
}
