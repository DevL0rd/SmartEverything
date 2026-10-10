import type { ReactNode, RefObject } from 'react';
import { createContext, use, useEffect, useState } from 'react';
import type { View } from 'react-native';

const ScopeVisible = createContext(true);

export function VisualVisibility({
  visible,
  children,
}: {
  readonly visible: boolean;
  readonly children: ReactNode;
}): ReactNode {
  return <ScopeVisible value={visible}>{children}</ScopeVisible>;
}

function observable(node: unknown): Element | null {
  if (typeof IntersectionObserver !== 'function' || typeof Element === 'undefined') {
    return null;
  }
  return node instanceof Element ? node : null;
}

function useIntersecting(ref: RefObject<View | null>): boolean {
  const [intersecting, setIntersecting] = useState(true);
  useEffect(() => {
    const target = observable(ref.current);
    if (target === null) {
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      const last = entries.at(-1);
      if (last !== undefined) {
        setIntersecting(last.isIntersecting);
      }
    });
    observer.observe(target);
    return (): void => {
      observer.disconnect();
    };
  }, [ref]);
  return intersecting;
}

export function useOnScreen(ref: RefObject<View | null>): boolean {
  const scope = use(ScopeVisible);
  const intersecting = useIntersecting(ref);
  return scope && intersecting;
}
