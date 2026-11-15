import { useState } from 'react';
import type { FlashListProps } from '@shopify/flash-list';
import { useIdiom } from '../../design/platform';
import { rowHeight, type MediaGridRow, type MediaZoomStep } from './justify';

export type GridScroll = NonNullable<FlashListProps<MediaGridRow>['onScroll']>;

export interface ContentAnchor {
  readonly maintainVisibleContentPosition: NonNullable<
    FlashListProps<MediaGridRow>['maintainVisibleContentPosition']
  >;
  readonly onScroll: GridScroll;
}

export function useContentAnchor(step: MediaZoomStep): ContentAnchor {
  const row = rowHeight(step, useIdiom());
  const [anchored, setAnchored] = useState(false);
  return {
    maintainVisibleContentPosition: { disabled: !anchored, autoscrollToTopThreshold: row },
    onScroll: (event): void => {
      if (!anchored && event.nativeEvent.contentOffset.y > row) setAnchored(true);
    },
  };
}
