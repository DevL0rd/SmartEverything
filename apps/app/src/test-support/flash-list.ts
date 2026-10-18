import type { FlashListRef } from '@shopify/flash-list';
import { createElement, Fragment, type ReactElement, type ReactNode } from 'react';

interface ListProps {
  readonly data?: readonly unknown[] | null;
  readonly renderItem?:
    ((info: { item: unknown; index: number; target: string }) => ReactNode) | null;
  readonly ListHeaderComponent?: ReactElement | null;
  readonly ListEmptyComponent?: ReactElement | null;
  readonly ListFooterComponent?: ReactElement | null;
}

export function FlashList({
  data,
  renderItem,
  ListHeaderComponent,
  ListEmptyComponent,
  ListFooterComponent,
}: ListProps): ReactElement {
  const rows = data ?? [];
  return createElement(
    Fragment,
    null,
    ListHeaderComponent,
    rows.length === 0 ? ListEmptyComponent : null,
    rows.map((item, index) =>
      createElement(Fragment, { key: index }, renderItem?.({ item, index, target: 'Cell' })),
    ),
    ListFooterComponent,
  );
}

export interface ScrollCall {
  readonly method: 'scrollToIndex' | 'scrollToOffset' | 'scrollToEnd' | 'scrollToTop';
  readonly args: unknown;
}

export interface FakeFlashListRef<T> extends FlashListRef<T> {
  readonly calls: ScrollCall[];
}

export function fakeFlashListRef<T>(): FakeFlashListRef<T> {
  const calls: ScrollCall[] = [];
  return {
    calls,
    props: { data: [], renderItem: null },
    scrollToOffset: (args): void => {
      calls.push({ method: 'scrollToOffset', args });
    },
    scrollToIndex: (args): Promise<void> => {
      calls.push({ method: 'scrollToIndex', args });
      return Promise.resolve();
    },
    scrollToEnd: (args): void => {
      calls.push({ method: 'scrollToEnd', args });
    },
    scrollToTop: (args): void => {
      calls.push({ method: 'scrollToTop', args });
    },
    scrollToItem: () => undefined,
    flashScrollIndicators: () => undefined,
    getNativeScrollRef: () => null,
    getScrollResponder: (): never => {
      throw new Error('The fake list has no scroll responder');
    },
    getScrollableNode: () => null,
    getFirstItemOffset: () => 0,
    getWindowSize: () => ({ width: 0, height: 0 }),
    getLayout: () => undefined,
    getAbsoluteLastScrollOffset: () => 0,
    getChildContainerDimensions: () => ({ width: 0, height: 0 }),
    recordInteraction: () => undefined,
    computeVisibleIndices: () => ({ startIndex: 0, endIndex: 0 }),
    getFirstVisibleIndex: () => 0,
    recomputeViewableItems: () => undefined,
    prepareForLayoutAnimationRender: () => undefined,
    clearLayoutCacheOnUpdate: () => undefined,
  };
}
