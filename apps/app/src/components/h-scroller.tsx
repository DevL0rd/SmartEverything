import { Children, useRef, useState, type ReactNode, type RefObject } from 'react';
import { ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { cn } from '../design/cn';
import { useIdiom } from '../design/platform';
import { scrollStepOf } from './h-scroller-step';
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

function EdgeFade(): ReactNode {
  return (
    <View
      pointerEvents="none"
      className="absolute inset-y-0 right-0 w-8 bg-linear-to-r from-surface-1/0 to-surface-1"
    />
  );
}

function useScrollBy(): {
  readonly ref: RefObject<ScrollView | null>;
  readonly track: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  readonly scrollBy: (delta: number) => void;
} {
  const ref = useRef<ScrollView>(null);
  const offset = useRef(0);
  return {
    ref,
    track: (event): void => {
      offset.current = event.nativeEvent.contentOffset.x;
    },
    scrollBy: (delta): void => {
      ref.current?.scrollTo({ x: Math.max(0, offset.current + delta), animated: true });
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

export function HScroller({
  children,
  label,
  fill = false,
  snapTo,
  fade = false,
}: {
  readonly children: ReactNode;
  readonly label: string;
  readonly fill?: boolean;
  readonly snapTo?: number;
  readonly fade?: boolean;
}): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const { ref, track, scrollBy } = useScrollBy();
  const [hovered, setHovered] = useState(false);
  return (
    <View
      accessibilityLabel={label}
      className={fill ? 'relative flex-1' : 'relative'}
      onPointerEnter={() => {
        setHovered(true);
      }}
      onPointerLeave={() => {
        setHovered(false);
      }}
    >
      <ScrollView
        ref={ref}
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        {...snapPropsOf(snapTo)}
        scrollEventThrottle={64}
        onScroll={track}
        className={cn(fill ? 'flex-1' : 'grow-0', snapClassOf(snapTo))}
        contentContainerClassName={fill ? 'h-full gap-grid-gap' : 'gap-grid-gap'}
      >
        <Snapped snapTo={snapTo}>{children}</Snapped>
      </ScrollView>
      {fade ? <EdgeFade /> : null}
      {pointer && hovered ? <Arrows scrollBy={scrollBy} step={scrollStepOf(snapTo)} /> : null}
    </View>
  );
}
