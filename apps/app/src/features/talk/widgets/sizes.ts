import type { BoardClass, WidgetSize } from '../../../components/widget-board';

const ALL: readonly WidgetSize[] = ['S', 'M', 'L', 'W'];

const LISTS: readonly WidgetSize[] = ['M', 'L', 'W'];

export const EVERY_SIZE: Readonly<Record<BoardClass, readonly WidgetSize[]>> = {
  compact: ALL,
  medium: ALL,
  expanded: ALL,
};

export const LIST_SIZES: Readonly<Record<BoardClass, readonly WidgetSize[]>> = {
  compact: LISTS,
  medium: LISTS,
  expanded: LISTS,
};
