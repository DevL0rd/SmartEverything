import type { ReactNode, RefObject } from 'react';
import { createContext, use, useRef } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useLiveAnimationGate, useScreenLive, type AnimationGate } from './animation-gate';
import { useLiveViewport, useViewport, type ViewportVisibility } from './viewport';

const PREWARM_MARGIN = 48;

const ScopeVisible = createContext(true);

const TileTracked = createContext(false);

export function VisualVisibility({
  visible,
  children,
}: {
  readonly visible: boolean;
  readonly children: ReactNode;
}): ReactNode {
  const outer = use(ScopeVisible);
  return <ScopeVisible value={visible ? outer : false}>{children}</ScopeVisible>;
}

export function useScopeVisible(): boolean {
  return use(ScopeVisible);
}

export function useOnScreen(
  ref: RefObject<View | null>,
  margin = PREWARM_MARGIN,
  tracking = true,
): ViewportVisibility {
  const scope = use(ScopeVisible);
  const tile = use(TileTracked);
  const viewport = useViewport(ref, { margin, tracking: tracking && !tile });
  return { visible: scope && viewport.visible, onLayout: viewport.onLayout };
}

export interface OnScreenGate extends AnimationGate {
  readonly onLayout: (() => void) | undefined;
}

export function useOnScreenGate(ref: RefObject<View | null>, wanted: boolean): OnScreenGate {
  const live = useScreenLive();
  const scope = use(ScopeVisible);
  const tile = use(TileTracked);
  const viewport = useLiveViewport(ref, { margin: PREWARM_MARGIN, tracking: !tile }, live);
  const gate = useLiveAnimationGate(wanted, scope && viewport.visible, live);
  return { ...gate, onLayout: viewport.onLayout };
}

export function TileViewport({
  style,
  children,
}: {
  readonly style: StyleProp<ViewStyle>;
  readonly children: ReactNode;
}): ReactNode {
  const ref = useRef<View>(null);
  const outer = use(ScopeVisible);
  const { visible, onLayout } = useViewport(ref, { margin: PREWARM_MARGIN });
  return (
    <View ref={ref} onLayout={onLayout} collapsable={false} style={style} className="absolute">
      <TileTracked value>
        <ScopeVisible value={outer ? visible : false}>{children}</ScopeVisible>
      </TileTracked>
    </View>
  );
}
