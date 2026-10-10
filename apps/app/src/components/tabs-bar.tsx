import type { ReactNode, RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import type { Href } from 'expo-router';
import { cn } from '../design/cn';
import { useMotion } from '../design/motion';
import { useIdiom } from '../design/platform';
import { Interactive } from './interactive';
import { Text } from './text';

export interface TabItem {
  readonly key: string;
  readonly label: string;
  readonly href?: Href;
  readonly onPress?: () => void;
}

const DENSE_FROM = 5;

interface Span {
  readonly x: number;
  readonly width: number;
}

function Tab({
  item,
  selected,
  pointer,
  dense,
  onMeasure,
}: {
  readonly item: TabItem;
  readonly selected: boolean;
  readonly pointer: boolean;
  readonly dense: boolean;
  readonly onMeasure: (span: Span) => void;
}): ReactNode {
  return (
    <View
      onLayout={(event) => {
        onMeasure({ x: event.nativeEvent.layout.x, width: event.nativeEvent.layout.width });
      }}
    >
      <Interactive
        role="tab"
        label={item.label}
        selected={selected}
        href={item.href}
        onPress={item.onPress}
        focusInset
        className={cn(
          'items-center justify-center',
          pointer ? cn('h-10 rounded-t-sm', dense ? 'px-3' : 'px-4') : 'h-12 min-w-24 px-4',
        )}
      >
        <Text variant="label" tone={selected ? 'primary' : 'variant'} numberOfLines={1}>
          {item.label}
        </Text>
        {selected ? (
          <View className="absolute inset-x-3 bottom-0 h-0.75 rounded-t-full bg-primary" />
        ) : null}
      </Interactive>
    </View>
  );
}

function revealedAt(spans: Readonly<Record<string, Span>>, span: Span, viewport: number): number {
  const needed = span.x + span.width - viewport;
  if (needed <= 0) {
    return 0;
  }
  const starts = Object.values(spans).map((other) => other.x);
  return Math.min(
    span.x,
    starts.sort((left, right) => left - right).find((x) => x >= needed) ?? span.x,
  );
}

function useRevealActive(
  active: string,
  spans: Readonly<Record<string, Span>>,
  viewport: number,
): RefObject<ScrollView | null> {
  const ref = useRef<ScrollView>(null);
  const { reduced } = useMotion();
  const first = useRef(true);
  const span = spans[active];
  useEffect(() => {
    if (span === undefined || viewport === 0) {
      return;
    }
    ref.current?.scrollTo({
      x: revealedAt(spans, span, viewport),
      animated: !reduced && !first.current,
    });
    first.current = false;
  }, [span, spans, viewport, reduced]);
  return ref;
}

export function TabsBar({
  items,
  active,
  label,
}: {
  readonly items: readonly TabItem[];
  readonly active: string;
  readonly label: string;
}): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const [spans, setSpans] = useState<Readonly<Record<string, Span>>>({});
  const [viewport, setViewport] = useState(0);
  const ref = useRevealActive(active, spans, viewport);
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      className="border-b border-outline-variant"
    >
      <ScrollView
        ref={ref}
        horizontal
        className="grow-0"
        showsHorizontalScrollIndicator={false}
        onLayout={(event) => {
          setViewport(event.nativeEvent.layout.width);
        }}
        contentContainerClassName={pointer && items.length <= DENSE_FROM ? 'gap-1' : ''}
      >
        {items.map((item) => (
          <Tab
            key={item.key}
            item={item}
            selected={item.key === active}
            pointer={pointer}
            dense={items.length > DENSE_FROM}
            onMeasure={(span) => {
              setSpans((current) => ({ ...current, [item.key]: span }));
            }}
          />
        ))}
      </ScrollView>
    </View>
  );
}
