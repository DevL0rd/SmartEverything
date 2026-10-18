import type { ReactElement, ReactNode, Ref, RefObject } from 'react';
import { memo, use, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import {
  FlashList,
  type FlashListProps,
  type FlashListRef,
  type ListRenderItem,
} from '@shopify/flash-list';
import { background } from '@smarteverything/logging';
import { useListProbe } from '../perf/list-probe';
import { useScrollToTop } from 'expo-router';
import { cn } from '../design/cn';
import { ScreenPausedContext, useScreenPaused } from '../design/screen-pause';
import { SectionHeader } from './virtual-list-header';
import { RowScope, useRowTracking, type RowVisibility } from './virtual-list-visibility';
import {
  flattenSections,
  headerIndices,
  indexOfItem,
  reuseRows,
  type ListRow,
  type VirtualSection,
} from './virtual-list-rows';

export type { VirtualSection };

export const DRAW_DISTANCE = 1000;
export const PAUSED_DRAW_DISTANCE = 200;
export const DRAW_STEP = 300;
const REVEAL_POSITION = 0.2;
const ITEM_TYPE = 'item';
const HEADER_TYPE = 'header';

export interface VirtualListHandle {
  readonly scrollToItem: (itemKey: string) => void;
}

export interface VirtualListProps<T> {
  readonly sections: readonly VirtualSection<T>[];
  readonly keyOf: (item: T) => string;
  readonly renderItem: (item: T) => ReactElement;
  readonly typeOf?: (item: T) => string;
  readonly header?: ReactElement;
  readonly empty?: ReactElement;
  readonly footer?: ReactElement;
  readonly onEndReached?: () => void;
  readonly widthClassName?: string;
  readonly drawDistance?: number;
  readonly sameItem?: (left: T, right: T) => boolean;
  readonly probe?: string;
  readonly handleRef?: Ref<VirtualListHandle>;
  readonly onScrollSettled?: (settled: ScrollSettled) => void;
}

export interface ScrollSettled {
  readonly offset: number;
  readonly contentHeight: number;
  readonly viewportHeight: number;
  readonly rows: number;
}

interface RowProps<T> {
  readonly item: T;
  readonly rowKey: string;
  readonly rows: RowVisibility;
  readonly widthClassName: string;
  readonly sameItem: (left: T, right: T) => boolean;
  readonly render: (item: T) => ReactElement;
}

function Row<T>({ item, rowKey, rows, widthClassName, render }: RowProps<T>): ReactNode {
  return (
    <View className="px-gutter">
      <View className={cn('w-full self-center', widthClassName)}>
        <RowScope rows={rows} rowKey={rowKey}>
          {render(item)}
        </RowScope>
      </View>
    </View>
  );
}

function sameRow<T>(left: RowProps<T>, right: RowProps<T>): boolean {
  return (
    left.rowKey === right.rowKey &&
    left.rows === right.rows &&
    left.render === right.render &&
    left.widthClassName === right.widthClassName &&
    left.sameItem === right.sameItem &&
    left.sameItem(left.item, right.item)
  );
}

function useRowComponent<T>(): (props: RowProps<T>) => ReactNode {
  const [component] = useState(() => memo(Row<T>, sameRow<T>));
  return component;
}

interface RowRendering<T> {
  readonly rows: RowVisibility;
  readonly widthClassName: string;
  readonly sameItem: (left: T, right: T) => boolean;
  readonly render: (item: T) => ReactElement;
}

function useRowRenderer<T>({
  rows,
  widthClassName,
  sameItem,
  render,
}: RowRendering<T>): ListRenderItem<ListRow<T>> {
  const ListRowView = useRowComponent<T>();
  return function renderRow({ item: row }): ReactElement {
    if (row.kind === 'header') {
      return <SectionHeader title={row.title} widthClassName={widthClassName} />;
    }
    return (
      <ListRowView
        item={row.item}
        rowKey={row.key}
        rows={rows}
        widthClassName={widthClassName}
        sameItem={sameItem}
        render={render}
      />
    );
  };
}

function useScrollTopRef<T>(): RefObject<FlashListRef<ListRow<T>> | null> {
  const ref = useRef<FlashListRef<ListRow<T>>>(null);
  useScrollToTop(ref);
  return ref;
}

function useStableRows<T>(
  next: readonly ListRow<T>[],
  sameItem: (left: T, right: T) => boolean,
): readonly ListRow<T>[] {
  const [held, setHeld] = useState(next);
  const stable = reuseRows(held, next, sameItem);
  if (stable !== held) setHeld(stable);
  return stable;
}

function useProbeProps<T>(
  name: string | undefined,
  total: number,
): Partial<FlashListProps<ListRow<T>>> {
  const probe = useListProbe(name, total);
  return probe.cell === undefined
    ? {}
    : {
        onScroll: probe.scrollWith(),
        onLayout: probe.onLayout,
        onContentSizeChange: probe.onContentSizeChange,
        CellRendererComponent: probe.cell,
        scrollEventThrottle: 100,
      };
}

type SettleEvent = NativeSyntheticEvent<NativeScrollEvent>;

function settleProps<T>(
  report: ((settled: ScrollSettled) => void) | undefined,
  rows: number,
): Partial<FlashListProps<ListRow<T>>> {
  if (report === undefined) return {};
  const settle = ({ nativeEvent }: SettleEvent): void => {
    report({
      offset: Math.round(nativeEvent.contentOffset.y),
      contentHeight: Math.round(nativeEvent.contentSize.height),
      viewportHeight: Math.round(nativeEvent.layoutMeasurement.height),
      rows,
    });
  };
  return { onMomentumScrollEnd: settle, onScrollEndDrag: settle };
}

function useDrawDistance(target: number): number {
  const pause = use(ScreenPausedContext);
  const [distance, setDistance] = useState(() =>
    pause.isPaused() ? Math.min(target, PAUSED_DRAW_DISTANCE) : target,
  );
  const paused = useScreenPaused();
  const growing = !paused && distance < target;
  useEffect(() => {
    if (!growing) return undefined;
    const frame = requestAnimationFrame(() => {
      setDistance((current) => Math.min(target, current + DRAW_STEP));
    });
    return (): void => {
      cancelAnimationFrame(frame);
    };
  }, [growing, distance, target]);
  return Math.min(distance, target);
}

function rowKeyOf(row: ListRow<unknown>): string {
  return row.key;
}

function ListFoot({ footer }: { readonly footer: ReactElement | undefined }): ReactNode {
  return <View className="pb-section-gap">{footer}</View>;
}

interface ScrollHandleInput<T> {
  readonly handleRef: Ref<VirtualListHandle> | undefined;
  readonly rows: readonly ListRow<T>[];
  readonly keyOf: (item: T) => string;
  readonly list: RefObject<FlashListRef<ListRow<T>> | null>;
}

function useScrollHandle<T>({ handleRef, rows, keyOf, list }: ScrollHandleInput<T>): void {
  useImperativeHandle(
    handleRef,
    () => ({
      scrollToItem: (itemKey): void => {
        const index = indexOfItem(rows, keyOf, itemKey);
        const current = list.current;
        if (index < 0 || current === null) return;
        background(
          current.scrollToIndex({ index, animated: true, viewPosition: REVEAL_POSITION }),
          'virtual_list.scroll_failed',
        );
      },
    }),
    [rows, keyOf, list],
  );
}

export function VirtualList<T>({
  sections,
  keyOf,
  renderItem,
  typeOf,
  header,
  empty,
  footer,
  onEndReached,
  widthClassName = '',
  drawDistance = DRAW_DISTANCE,
  sameItem = Object.is,
  probe: probeName,
  handleRef,
  onScrollSettled,
}: VirtualListProps<T>): ReactNode {
  const { rows, pairs } = useRowTracking();
  const renderRow = useRowRenderer({ rows, widthClassName, sameItem, render: renderItem });
  const ref = useScrollTopRef<T>();
  const distance = useDrawDistance(drawDistance);
  const listRows = useStableRows(flattenSections(sections, keyOf), sameItem);
  const sticky = useMemo(() => headerIndices(listRows), [listRows]);
  useScrollHandle({ handleRef, rows: listRows, keyOf, list: ref });
  const typeOfRow = (row: ListRow<T>): string =>
    row.kind === 'header' ? HEADER_TYPE : (typeOf?.(row.item) ?? ITEM_TYPE);
  return (
    <FlashList<ListRow<T>>
      ref={ref}
      data={listRows}
      keyExtractor={rowKeyOf}
      getItemType={typeOfRow}
      renderItem={renderRow}
      viewabilityConfigCallbackPairs={pairs}
      {...useProbeProps<T>(probeName, listRows.length)}
      {...settleProps<T>(onScrollSettled, listRows.length)}
      stickyHeaderIndices={sticky}
      drawDistance={distance}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ListFooterComponent={<ListFoot footer={footer} />}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
    />
  );
}
