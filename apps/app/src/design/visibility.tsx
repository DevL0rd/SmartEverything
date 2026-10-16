import type { ReactNode, RefObject } from 'react';
import { createContext, use } from 'react';
import type { View } from 'react-native';
import { useViewport, type ViewportVisibility } from './viewport';

const PREWARM_MARGIN = 48;

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

export function useOnScreen(ref: RefObject<View | null>): ViewportVisibility {
  const scope = use(ScopeVisible);
  const viewport = useViewport(ref, { margin: PREWARM_MARGIN, screenOnly: true });
  return { visible: scope && viewport.visible, onLayout: viewport.onLayout };
}
