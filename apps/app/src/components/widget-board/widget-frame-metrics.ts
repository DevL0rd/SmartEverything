import { StyleSheet } from 'react-native';
import type { Idiom } from '../../design/tokens';
import type { WidgetFrameBox } from './frame-class';

export const WIDGET_BODY_GAP = 12;

const HEADER_HEIGHT: Readonly<Record<Idiom, number>> = { touch: 40, pointer: 32 };

export function widgetHeaderHeight(idiom: Idiom): number {
  return HEADER_HEIGHT[idiom];
}

export function widgetBodyHeight({ height, idiom }: WidgetFrameBox): number {
  return height - 2 * StyleSheet.hairlineWidth - widgetHeaderHeight(idiom) - WIDGET_BODY_GAP;
}
