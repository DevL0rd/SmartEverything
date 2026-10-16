import type { RefObject } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWindowDimensions, type View } from 'react-native';
import { useIsFocused } from 'expo-router';
import { useAnimatedReaction } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useScreen } from '../components/screen-context';
import { useInsideOverlay } from '../components/overlay-shown';
import { useForeground } from './animation-gate';
import type { ViewportOptions, ViewportVisibility } from './viewport';

const SCROLL_STEP = 48;

interface ViewportBounds {
  readonly margin: number;
  readonly width: number;
  readonly height: number;
}

function useMeasurement(
  ref: RefObject<View | null>,
  { width, height, margin }: ViewportBounds,
  enabled: boolean,
  change: (visible: boolean) => void,
): () => void {
  const scope = useMemo(
    () => ({ ref, width, height, enabled, margin, change }),
    [ref, width, height, enabled, margin, change],
  );
  const lifetime = useRef<{ scope: typeof scope | null; measurement: number }>({
    scope: null,
    measurement: 0,
  });
  const measure = useCallback((): void => {
    const active = lifetime.current;
    const node = scope.ref.current;
    if (node === null || !scope.enabled || active.scope !== scope) return;
    const measurement = ++active.measurement;
    node.measureInWindow((x, y, w, h) => {
      if (
        active.scope !== scope ||
        scope.ref.current !== node ||
        measurement !== active.measurement
      )
        return;
      scope.change(
        w > 0 &&
          h > 0 &&
          y < scope.height + scope.margin &&
          y + h > -scope.margin &&
          x < scope.width &&
          x + w > 0,
      );
    });
  }, [scope]);
  useEffect(() => {
    const active = lifetime.current;
    active.scope = scope;
    measure();
    return (): void => {
      if (active.scope === scope) active.scope = null;
      active.measurement++;
    };
  }, [measure, scope]);
  return measure;
}

export function useViewport(
  ref: RefObject<View | null>,
  { margin = 0, screenOnly = false }: ViewportOptions = {},
): ViewportVisibility {
  const [visible, setVisible] = useState(true);
  const size = useWindowDimensions();
  const { scrollY, scrollable } = useScreen();
  const focused = useIsFocused();
  const foreground = useForeground();
  const overlay = useInsideOverlay();
  const tracked = !screenOnly || (scrollable && !overlay);
  const measure = useMeasurement(
    ref,
    { ...size, margin },
    tracked && focused && foreground,
    setVisible,
  );
  useAnimatedReaction(
    () => Math.round(scrollY.get() / SCROLL_STEP),
    (step, previous) => {
      if (step !== previous) scheduleOnRN(measure);
    },
    [measure],
  );
  return { onLayout: measure, visible: !tracked || visible };
}
