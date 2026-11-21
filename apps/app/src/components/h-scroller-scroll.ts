import { useEffect, useEffectEvent, useRef, useState, type RefObject } from 'react';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { revealOffset, type RevealRange } from './h-scroller-step';

export interface ScrollEdges {
  readonly overflow: boolean;
  readonly start: boolean;
  readonly end: boolean;
}

interface ScrollMetrics {
  viewport: number;
  content: number;
  offset: number;
  edges: ScrollEdges;
}

export type ScrollToX = (x: number) => void;

function useReveal(
  scrollTo: ScrollToX,
  metrics: RefObject<ScrollMetrics>,
  reveal: RevealRange | null,
): { readonly revealPending: () => void; readonly retarget: () => void } {
  const pending = useRef<RevealRange | null>(null);
  const target = useRef<RevealRange | null>(null);
  const revealPending = (): void => {
    const range = pending.current;
    const { viewport, offset, content } = metrics.current;
    if (range === null || viewport === 0 || content < range.x + range.width) return;
    pending.current = null;
    const next = revealOffset(range, offset, viewport);
    if (next !== null) scrollTo(next);
  };
  const queue = useEffectEvent((range: RevealRange | null): void => {
    target.current = range;
    pending.current = range;
    revealPending();
  });
  useEffect(() => {
    queue(reveal);
  }, [reveal]);
  return {
    revealPending,
    retarget: (): void => {
      pending.current = target.current;
      revealPending();
    },
  };
}

export interface ScrollBy {
  readonly onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  readonly onLayout: (event: LayoutChangeEvent) => void;
  readonly onContentSizeChange: (width: number) => void;
  readonly scrollBy: (delta: number) => void;
  readonly edges: ScrollEdges;
}

export function useScrollBy(scrollTo: ScrollToX, reveal: RevealRange | null): ScrollBy {
  const [edges, setEdges] = useState<ScrollEdges>({ overflow: false, start: false, end: false });
  const metrics = useRef<ScrollMetrics>({ viewport: 0, content: 0, offset: 0, edges });
  const { revealPending, retarget } = useReveal(scrollTo, metrics, reveal);
  const updateEdges = (): void => {
    const current = metrics.current;
    const overflow = current.content > current.viewport + 2;
    const start = overflow && current.offset > 2;
    const end = overflow && current.content > current.viewport + current.offset + 2;
    const same =
      current.edges.overflow === overflow &&
      current.edges.start === start &&
      current.edges.end === end;
    if (same) return;
    current.edges = { overflow, start, end };
    setEdges(current.edges);
  };
  return {
    edges,
    onScroll: (event): void => {
      metrics.current.offset = event.nativeEvent.contentOffset.x;
      updateEdges();
    },
    onLayout: (event): void => {
      const { width } = event.nativeEvent.layout;
      const resized = width !== metrics.current.viewport;
      metrics.current.viewport = width;
      updateEdges();
      if (resized) retarget();
      else revealPending();
    },
    onContentSizeChange: (width): void => {
      metrics.current.content = width;
      updateEdges();
      revealPending();
    },
    scrollBy: (delta): void => {
      scrollTo(Math.max(0, metrics.current.offset + delta));
    },
  };
}

export interface PointerHover {
  readonly pointerHover: boolean;
  readonly onPointerEnter: () => void;
  readonly onPointerLeave: () => void;
}

export function usePointerHover(pointer: boolean): PointerHover {
  const [hovered, setHovered] = useState(false);
  return {
    pointerHover: pointer ? hovered : false,
    onPointerEnter: (): void => {
      setHovered(true);
    },
    onPointerLeave: (): void => {
      setHovered(false);
    },
  };
}
