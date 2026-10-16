import type { RefObject } from 'react';
import { useEffect, useState } from 'react';
import type { View } from 'react-native';

export interface ViewportVisibility {
  readonly visible: boolean;
  readonly onLayout: (() => void) | undefined;
}

export interface ViewportOptions {
  readonly margin?: number;
  readonly screenOnly?: boolean;
}

function observable(node: unknown): Element | null {
  if (typeof IntersectionObserver !== 'function' || typeof Element === 'undefined') {
    return null;
  }
  return node instanceof Element ? node : null;
}

export function useViewport(
  ref: RefObject<View | null>,
  _options: ViewportOptions = {},
): ViewportVisibility {
  const [visible, setVisible] = useState(true);
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
