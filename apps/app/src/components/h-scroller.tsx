import { Children, useRef, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { cn } from '../design/cn';
import { useIdiom } from '../design/platform';
import { scrollStepOf, type RevealRange } from './h-scroller-step';
import { usePointerHover, useScrollBy, type ScrollEdges } from './h-scroller-scroll';
import { IconButton } from './icon-button';

export type { RevealRange } from './h-scroller-step';

function Arrows({
  scrollBy,
  step,
  edges,
}: {
  readonly scrollBy: (delta: number) => void;
  readonly step: number;
  readonly edges: ScrollEdges;
}): ReactNode {
  return (
    <>
      {edges.start ? (
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
      ) : null}
      {edges.end ? (
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
      ) : null}
    </>
  );
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

export function fadeClassOf(fade: boolean | undefined, edges: ScrollEdges): string {
  if (fade !== true) return '';
  return cn(edges.start && 'mask-l-from-88%', edges.end && 'mask-r-from-88%');
}

export function ScrollArrows({
  edges,
  arrows = true,
  pointerHover,
  scrollStep,
  snapTo,
  scrollBy,
}: Pick<HScrollerProps, 'arrows' | 'scrollStep'> & {
  readonly edges: ScrollEdges;
  readonly pointerHover: boolean;
  readonly snapTo: number | undefined;
  readonly scrollBy: (delta: number) => void;
}): ReactNode {
  return arrows && pointerHover && edges.overflow ? (
    <Arrows scrollBy={scrollBy} step={scrollStep ?? scrollStepOf(snapTo)} edges={edges} />
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
  const ref = useRef<ScrollView>(null);
  const { edges, scrollBy, ...scrollerProps } = useScrollBy((x) => {
    ref.current?.scrollTo({ x, animated: true });
  }, reveal);
  const { pointerHover, ...hover } = usePointerHover(useIdiom() === 'pointer');
  return (
    <View accessibilityLabel={label} className={frame} {...hover}>
      <ScrollView
        {...scrollerProps}
        ref={ref}
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
        pointerHover={pointerHover}
        snapTo={snapTo}
        scrollBy={scrollBy}
      />
    </View>
  );
}
