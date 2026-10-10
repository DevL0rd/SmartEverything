import type { ComponentType, ReactElement, ReactNode, RefObject } from 'react';
import { memo, useRef, useState } from 'react';
import { SectionList, View, type ListRenderItem, type SectionListData } from 'react-native';
import { useScrollToTop } from 'expo-router';
import { cn } from '../design/cn';
import { useResizeWhileHidden } from './use-resize-while-hidden';
import { ListTop, SectionHeader } from './virtual-list-header';
import { useRowLayout, type FixedRows } from './virtual-list-layout';

const NO_SECTIONS: readonly never[] = [];

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
  readonly windowSize?: number;
  readonly initialNumToRender?: number;
  readonly sameItem?: (left: T, right: T) => boolean;
  readonly fixedRows?: FixedRows;
}

interface RowProps<T> {
  readonly item: T;
  readonly widthClassName: string;
  readonly sameItem: (left: T, right: T) => boolean;
  readonly render: (item: T) => ReactElement;
}

function Row<T>({ item, widthClassName, render }: RowProps<T>): ReactNode {
  return (
    <View className="px-gutter">
      <View className={cn('w-full self-center', widthClassName)}>{render(item)}</View>
    </View>
  );
}

function sameRow<T>(left: RowProps<T>, right: RowProps<T>): boolean {
  return (
    left.render === right.render &&
    left.widthClassName === right.widthClassName &&
    left.sameItem === right.sameItem &&
    left.sameItem(left.item, right.item)
  );
}

function useRowComponent<T>(): ComponentType<RowProps<T>> {
  const [component] = useState(() => memo(Row<T>, sameRow<T>));
  return component;
}

function useRowRenderer<T>(
  widthClassName: string,
  sameItem: (left: T, right: T) => boolean,
  render: (item: T) => ReactElement,
): ListRenderItem<T> {
  const ListRow = useRowComponent<T>();
  return function renderRow({ item }): ReactElement {
    return (
      <ListRow item={item} widthClassName={widthClassName} sameItem={sameItem} render={render} />
    );
  };
}

function useScrollTopRef<T>(): RefObject<SectionList<T, VirtualSection<T>> | null> {
  const ref = useRef<SectionList<T, VirtualSection<T>>>(null);
  useScrollToTop(ref);
  return ref;
}

function listSections<T>(
  sections: readonly VirtualSection<T>[],
): SectionListData<T, VirtualSection<T>>[] {
  return sections.map((section) => ({ ...section, data: [...section.data] }));
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
  windowSize = 7,
  initialNumToRender = 20,
  sameItem = Object.is,
  fixedRows,
}: VirtualListProps<T>): ReactNode {
  const renderRow = useRowRenderer(widthClassName, sameItem, renderItem);
  const ref = useScrollTopRef<T>();
  const { getItemLayout, reportHeader, initialItems } = useRowLayout(sections, fixedRows);
  const resizes = useResizeWhileHidden();
  return (
    <SectionList<T, VirtualSection<T>>
      key={resizes}
      ref={ref}
      sections={listSections(sections)}
      keyExtractor={keyOf}
      renderItem={renderRow}
      renderSectionHeader={({ section }) => (
        <SectionHeader title={section.title} widthClassName={widthClassName} />
      )}
      getItemLayout={getItemLayout}
      stickySectionHeadersEnabled
      ListHeaderComponent={
        <ListTop
          header={header}
          sections={fixedRows === undefined ? NO_SECTIONS : sections}
          widthClassName={widthClassName}
          onLength={reportHeader}
        />
      }
      ListEmptyComponent={empty}
      ListFooterComponent={footer}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      initialNumToRender={initialItems ?? initialNumToRender}
      windowSize={windowSize}
      contentContainerClassName="pb-section-gap"
    />
  );
}
