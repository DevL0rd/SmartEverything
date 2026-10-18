import { WIDGET_FOOTPRINTS } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { WidgetSize } from '../../components/widget-board';
import { cellOf, frameOf } from '../../components/widget-board/board-geometry';
import { useIdiom } from '../../design/platform';
import { useThemeSetting } from '../../design/theme';

function heightStyle(height: number): { readonly height: number } {
  return { height };
}

export function PageWidget({
  size,
  children,
}: {
  readonly size: WidgetSize;
  readonly children: ReactNode;
}): ReactNode {
  const idiom = useIdiom();
  const density = useThemeSetting('density');
  const { rows } = WIDGET_FOOTPRINTS.compact[size];
  const cell = cellOf(0, 1, idiom, density);
  return (
    <View style={heightStyle(frameOf(cell, { col: 0, row: 0, cols: 1, rows }).height)}>
      {children}
    </View>
  );
}
