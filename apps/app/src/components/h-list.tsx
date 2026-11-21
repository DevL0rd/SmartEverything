import { useRef, type ReactElement, type ReactNode } from 'react';
import { View } from 'react-native';
import { FlashList, type FlashListRef, type ListRenderItem } from '@shopify/flash-list';
import { useIdiom } from '../design/platform';
import { ScrollArrows, fadeClassOf } from './h-scroller';
import { usePointerHover, useScrollBy } from './h-scroller-scroll';

function Gap(): ReactNode {
  return <View className="w-grid-gap" />;
}

function Inset(): ReactNode {
  return <View className="w-4" />;
}

function insetProps(inset: boolean): {
  readonly ListHeaderComponent?: () => ReactNode;
  readonly ListFooterComponent?: () => ReactNode;
} {
  return inset ? { ListHeaderComponent: Inset, ListFooterComponent: Inset } : {};
}

export interface HListProps<T> {
  readonly data: readonly T[];
  readonly keyOf: (item: T) => string;
  readonly renderItem: (item: T) => ReactElement;
  readonly label: string;
  readonly fade?: boolean;
  readonly inset?: boolean;
}

export function HList<T>({
  data,
  keyOf,
  renderItem,
  label,
  fade,
  inset = false,
}: HListProps<T>): ReactNode {
  const ref = useRef<FlashListRef<T>>(null);
  const { pointerHover, ...hover } = usePointerHover(useIdiom() === 'pointer');
  const { edges, scrollBy, ...scrollProps } = useScrollBy((offset) => {
    ref.current?.scrollToOffset({ offset, animated: true });
  }, null);
  const renderCell: ListRenderItem<T> = ({ item }) => renderItem(item);
  return (
    <View accessibilityLabel={label} className="relative" {...hover}>
      <View className={fadeClassOf(fade, edges)}>
        <FlashList<T>
          {...scrollProps}
          {...insetProps(inset)}
          ref={ref}
          data={data}
          keyExtractor={keyOf}
          renderItem={renderCell}
          horizontal
          ItemSeparatorComponent={Gap}
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          scrollEventThrottle={64}
        />
      </View>
      <ScrollArrows
        edges={edges}
        pointerHover={pointerHover}
        snapTo={undefined}
        scrollBy={scrollBy}
      />
    </View>
  );
}
