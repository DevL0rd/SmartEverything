import type { ReactNode } from 'react';
import { Children, isValidElement, useState } from 'react';
import { View } from 'react-native';
import { cn } from '../design/cn';
import { useIdiom } from '../design/platform';
import { useThemeSetting } from '../design/theme';
import { gridLayoutOf, type GridGap, type GridLayout } from './grid-layout';

export interface GridProps {
  readonly minItemWidth: number;
  readonly gap?: GridGap;
  readonly maxColumns?: number;
  readonly measuredWidth?: number;
  readonly cellClassName?: string;
  readonly stretchLastRow?: boolean;
  readonly children: ReactNode;
}

export function useGridLayout(
  width: number,
  minItemWidth: number,
  gap: GridGap,
  maxColumns: number,
): GridLayout {
  const idiom = useIdiom();
  const density = useThemeSetting('density');
  return gridLayoutOf({ width, minItemWidth, maxColumns, gap, idiom, density });
}

export function Grid({
  minItemWidth,
  gap = 'grid',
  maxColumns = 6,
  measuredWidth,
  cellClassName,
  stretchLastRow = true,
  children,
}: GridProps): ReactNode {
  const [layoutWidth, setLayoutWidth] = useState(0);
  const width = measuredWidth ?? layoutWidth;
  const items = Children.toArray(children).filter(isValidElement);
  const { columns, cellWidth } = useGridLayout(width, minItemWidth, gap, maxColumns);
  const gapClass = gap === 'grid' ? 'gap-grid-gap' : 'gap-2';
  const rows: (typeof items)[] = [];
  for (let index = 0; index < items.length; index += columns) {
    rows.push(items.slice(index, index + columns));
  }
  return (
    <View
      onLayout={(event) => {
        if (measuredWidth === undefined) setLayoutWidth(event.nativeEvent.layout.width);
      }}
      className={gapClass}
    >
      {width === 0
        ? null
        : rows.map((row, index) => (
            <View key={String(index)} className={cn('flex-row items-stretch', gapClass)}>
              {row.map((item, column) => (
                <View
                  key={item.key ?? column}
                  className={cn('min-w-0', stretchLastRow && 'flex-1', cellClassName)}
                  style={stretchLastRow ? undefined : { width: cellWidth }}
                >
                  {item}
                </View>
              ))}
            </View>
          ))}
    </View>
  );
}
