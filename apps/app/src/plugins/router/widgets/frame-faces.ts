import type { BoardClass, WidgetSize } from '../../../components/widget-board';

export const INTERNET_WIDGET_SIZES: Readonly<Record<BoardClass, readonly WidgetSize[]>> = {
  compact: ['M', 'XL'],
  medium: ['M', 'W', 'XL'],
  expanded: ['M', 'W', 'XL'],
};

export const PEOPLE_WIDGET_SIZES: Readonly<Record<BoardClass, readonly WidgetSize[]>> = {
  compact: ['M', 'XL'],
  medium: ['M', 'XL'],
  expanded: ['M', 'XL'],
};
