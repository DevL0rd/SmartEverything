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

interface Span {
  readonly x: number;
  readonly width: number;
}

function Tab({
  item,
  selected,
  pointer,
  onMeasure,
}: {
  readonly item: TabItem;
  readonly selected: boolean;
  readonly pointer: boolean;
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
        className={cn(
          'items-center justify-center px-4',
          pointer ? 'h-10 rounded-t-sm' : 'h-12 min-w-24',
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
    const x = Math.max(0, span.x + span.width / 2 - viewport / 2);
    ref.current?.scrollTo({ x, animated: !reduced && !first.current });
    first.current = false;
  }, [span, viewport, reduced]);
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
        showsHorizontalScrollIndicator={false}
        onLayout={(event) => {
          setViewport(event.nativeEvent.layout.width);
        }}
        contentContainerClassName={pointer ? 'gap-1' : ''}
      >
        {items.map((item) => (
          <Tab
            key={item.key}
            item={item}
            selected={item.key === active}
            pointer={pointer}
            onMeasure={(span) => {
              setSpans((current) => ({ ...current, [item.key]: span }));
            }}
          />
        ))}
      </ScrollView>
    </View>
  );
}
