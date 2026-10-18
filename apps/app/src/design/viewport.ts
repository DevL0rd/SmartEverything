import type { RefObject } from 'react';
import { useEffect, useState } from 'react';
import type { View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import type { ScreenLive } from './animation-gate';
import { inertViewport, type ViewportRegistry } from './viewport-registry';

export interface ViewportVisibility {
  readonly visible: boolean;
  readonly onLayout: (() => void) | undefined;
}

export interface ViewportOptions {
  readonly margin?: number;
  readonly tracking?: boolean;
}

const INERT = inertViewport();

export function useScreenViewport(_scrollY: SharedValue<number>): ViewportRegistry {
  return INERT;
}

export function measurable(): boolean {
  return typeof IntersectionObserver === 'function' && typeof Element !== 'undefined';
}

function observable(node: unknown): Element | null {
  if (!measurable()) {
    return null;
  }
  return node instanceof Element ? node : null;
}

export function useLiveViewport(
  ref: RefObject<View | null>,
  options: ViewportOptions,
  _live: ScreenLive,
): ViewportVisibility {
  return useViewport(ref, options);
}

export function useViewport(
  ref: RefObject<View | null>,
  _options: ViewportOptions = {},
): ViewportVisibility {
  const [visible, setVisible] = useState(() => !measurable());
  useEffect(() => {
    const target = observable(ref.current);
    if (target === null) return undefined;
    const observer = new IntersectionObserver((entries) => {
      const last = entries.at(-1);
      if (last !== undefined) setVisible(last.isIntersecting);
    });
    observer.observe(target);
    return (): void => {
      observer.disconnect();
    };
  }, [ref]);
  return { visible, onLayout: undefined };
}
