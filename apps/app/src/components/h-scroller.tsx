import {
  Children,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  ScrollView,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { cn } from '../design/cn';
import { useIdiom } from '../design/platform';
import { revealOffset, scrollStepOf, type RevealRange } from './h-scroller-step';

export type { RevealRange } from './h-scroller-step';
import { IconButton } from './icon-button';

function Arrows({
  scrollBy,
  step,
}: {
  readonly scrollBy: (delta: number) => void;
  readonly step: number;
}): ReactNode {
  return (
    <>
      <View className="absolute inset-y-0 left-0 justify-center">
        <IconButton
          icon="chevronLeft"
          label="Scroll back"
          variant="tonal"
          onPress={() => {
            scrollBy(-step);
          }}
        />
      </View>
      <View className="absolute inset-y-0 right-0 justify-center">
        <IconButton
          icon="chevronRight"
          label="Scroll forward"
          variant="tonal"
          onPress={() => {
            scrollBy(step);
          }}
        />
      </View>
    </>
  );
}

interface ScrollMetrics {
  viewport: number;
  content: number;
  offset: number;
  edges: { readonly overflow: boolean; readonly start: boolean; readonly end: boolean };
}

function useReveal(
  ref: RefObject<ScrollView | null>,
  metrics: RefObject<ScrollMetrics>,
  reveal: RevealRange | null,
): () => void {
  const pending = useRef<RevealRange | null>(null);
  const revealPending = (): void => {
    const range = pending.current;
    const { viewport, offset, content } = metrics.current;
    if (range === null || viewport === 0 || content < range.x + range.width) return;
    pending.current = null;
    const next = revealOffset(range, offset, viewport);
    if (next !== null) ref.current?.scrollTo({ x: next, animated: true });
  };
  const queue = useEffectEvent((range: RevealRange): void => {
    pending.current = range;
    revealPending();
  });
  useEffect(() => {
    if (reveal !== null) queue(reveal);
  }, [reveal]);
  return revealPending;
}

function useScrollBy(reveal: RevealRange | null): {
  readonly ref: RefObject<ScrollView | null>;
  readonly onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  readonly onLayout: (event: LayoutChangeEvent) => void;
  readonly onContentSizeChange: (width: number) => void;
  readonly scrollBy: (delta: number) => void;
  readonly edges: ScrollMetrics['edges'];
} {
  const ref = useRef<ScrollView>(null);
  const [edges, setEdges] = useState({ overflow: false, start: false, end: false });
  const metrics = useRef<ScrollMetrics>({ viewport: 0, content: 0, offset: 0, edges });
  const revealPending = useReveal(ref, metrics, reveal);
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
    ref,
    edges,
    onScroll: (event): void => {
      metrics.current.offset = event.nativeEvent.contentOffset.x;
      updateEdges();
    },
    onLayout: (event): void => {
      metrics.current.viewport = event.nativeEvent.layout.width;
      updateEdges();
      revealPending();
    },
    onContentSizeChange: (width): void => {
      metrics.current.content = width;
      updateEdges();
      revealPending();
    },
    scrollBy: (delta): void => {
      ref.current?.scrollTo({ x: Math.max(0, metrics.current.offset + delta), animated: true });
    },
  };
}

const SNAP_CLASS = 'web:snap-x web:snap-mandatory';

function snapClassOf(snapTo: number | undefined): string {
  return snapTo === undefined ? '' : SNAP_CLASS;
}

function snapPropsOf(snapTo: number | undefined): {
  readonly snapToInterval?: number;
  readonly snapToAlignment?: 'start';
} {
  return snapTo === undefined ? {} : { snapToInterval: snapTo, snapToAlignment: 'start' };
}

function Snapped({
  children,
  snapTo,
}: {
  readonly children: ReactNode;
  readonly snapTo: number | undefined;
}): ReactNode {
  return snapTo === undefined
    ? children
    : Children.map(children, (child) => <View className="web:snap-start">{child}</View>);
}

const SCROLLER_LAYOUT = {
  fill: ['relative flex-1', 'flex-1', 'h-full gap-grid-gap'],
  fit: ['relative', 'grow-0', 'gap-grid-gap'],
} as const;

interface HScrollerProps {
  readonly children: ReactNode;
  readonly label: string;
  readonly fill?: boolean;
  readonly snapTo?: number;
  readonly fade?: boolean;
  readonly inset?: boolean;
  readonly arrows?: boolean;
  readonly scrollStep?: number;
  readonly reveal?: RevealRange | null;
}

function fadeClassOf(fade: boolean | undefined, edges: ScrollMetrics['edges']): string {
  if (fade !== true) return '';
  return cn(edges.start && 'mask-l-from-88%', edges.end && 'mask-r-from-88%');
}

function ScrollArrows({
  edges,
  arrows = true,
  pointerHover,
  scrollStep,
  snapTo,
  scrollBy,
}: Pick<HScrollerProps, 'arrows' | 'scrollStep'> & {
  readonly edges: ScrollMetrics['edges'];
  readonly pointerHover: boolean;
  readonly snapTo: number | undefined;
  readonly scrollBy: (delta: number) => void;
}): ReactNode {
  return arrows && pointerHover && edges.overflow ? (
    <Arrows scrollBy={scrollBy} step={scrollStep ?? scrollStepOf(snapTo)} />
  ) : null;
}

export function HScroller({
  children,
  label,
  fill = false,
  snapTo,
  fade,
  inset = false,
  reveal = null,
  ...appearance
}: HScrollerProps): ReactNode {
  const [frame, scroller, content] = SCROLLER_LAYOUT[fill ? 'fill' : 'fit'];
  const pointer = useIdiom() === 'pointer';
  const { edges, scrollBy, ...scrollerProps } = useScrollBy(reveal);
  const [hovered, setHovered] = useState(false);
  return (
    <View
      accessibilityLabel={label}
      className={frame}
      onPointerEnter={() => {
        setHovered(true);
      }}
      onPointerLeave={() => {
        setHovered(false);
      }}
    >
      <ScrollView
        {...scrollerProps}
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        {...snapPropsOf(snapTo)}
        scrollEventThrottle={64}
        className={cn(scroller, snapClassOf(snapTo), fadeClassOf(fade, edges))}
        contentContainerClassName={cn(content, inset && 'px-4')}
      >
        <Snapped snapTo={snapTo}>{children}</Snapped>
      </ScrollView>
      <ScrollArrows
        {...appearance}
        edges={edges}
        pointerHover={pointer ? hovered : false}
        snapTo={snapTo}
        scrollBy={scrollBy}
      />
    </View>
  );
}
