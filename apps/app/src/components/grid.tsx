import type { ReactNode } from 'react';
import { Children, isValidElement, useState } from 'react';
import { View } from 'react-native';
import { cn } from '../design/cn';

export interface GridProps {
  readonly minItemWidth: number;
  readonly gap?: 'grid' | 'tight';
  readonly maxColumns?: number;
  readonly children: ReactNode;
}

const GAP_PX = { grid: 12, tight: 8 } as const;

export function columnsFor(
  width: number,
  minItemWidth: number,
  gap: number,
  maxColumns: number,
): number {
  return Math.max(1, Math.min(maxColumns, Math.floor((width + gap) / (minItemWidth + gap))));
}

export function Grid({
  minItemWidth,
  gap = 'grid',
  maxColumns = 6,
  children,
}: GridProps): ReactNode {
  const [width, setWidth] = useState(0);
  const items = Children.toArray(children).filter(isValidElement);
  const columns = columnsFor(width, minItemWidth, GAP_PX[gap], maxColumns);
  const rows: (typeof items)[] = [];
  for (let index = 0; index < items.length; index += columns) {
    rows.push(items.slice(index, index + columns));
  }
  return (
    <View
      onLayout={(event) => {
        setWidth(event.nativeEvent.layout.width);
      }}
      className={cn(gap === 'grid' ? 'gap-grid-gap' : 'gap-2')}
    >
      {width === 0
        ? null
        : rows.map((row, index) => (
            <View
              key={String(index)}
              className={cn('flex-row items-stretch', gap === 'grid' ? 'gap-grid-gap' : 'gap-2')}
            >
              {row.map((item, column) => (
                <View key={item.key ?? column} className="min-w-0 flex-1">
                  {item}
                </View>
              ))}
            </View>
          ))}
    </View>
  );
}
