import type { ReactElement, ReactNode } from 'react';
import { useRef } from 'react';
import { SectionList, View, type SectionListData } from 'react-native';
import { useScrollToTop } from 'expo-router';
import { cn } from '../design/cn';
import { Text } from './text';

export interface VirtualSection<T> {
  readonly key: string;
  readonly title: string;
  readonly data: readonly T[];
}

export interface VirtualListProps<T> {
  readonly sections: readonly VirtualSection<T>[];
  readonly keyOf: (item: T) => string;
  readonly renderItem: (item: T) => ReactElement;
  readonly header?: ReactElement;
  readonly empty?: ReactElement;
  readonly footer?: ReactElement;
  readonly onEndReached?: () => void;
  readonly widthClassName?: string;
}

function SectionHeader({
  title,
  widthClassName,
}: {
  readonly title: string;
  readonly widthClassName: string;
}): ReactNode {
  return (
    <View className="bg-bg px-gutter pb-1 pt-4">
      <Text
        variant="footnote"
        tone="variant"
        accessibilityRole="header"
        className={cn('w-full self-center', widthClassName)}
      >
        {title}
      </Text>
    </View>
  );
}

export function VirtualList<T>({
  sections,
  keyOf,
  renderItem,
  header,
  empty,
  footer,
  onEndReached,
  widthClassName = '',
}: VirtualListProps<T>): ReactNode {
  const ref = useRef<SectionList<T, VirtualSection<T>>>(null);
  useScrollToTop(ref);
  const data: SectionListData<T, VirtualSection<T>>[] = sections.map((section) => ({
    ...section,
    data: [...section.data],
  }));
  return (
    <SectionList<T, VirtualSection<T>>
      ref={ref}
      sections={data}
      keyExtractor={keyOf}
      renderItem={({ item }) => (
        <View className="px-gutter">
          <View className={cn('w-full self-center', widthClassName)}>{renderItem(item)}</View>
        </View>
      )}
      renderSectionHeader={({ section }) => (
        <SectionHeader title={section.title} widthClassName={widthClassName} />
      )}
      stickySectionHeadersEnabled
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ListFooterComponent={footer}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      initialNumToRender={20}
      windowSize={7}
      contentContainerClassName="pb-section-gap"
    />
  );
}
