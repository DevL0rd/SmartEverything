import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { columnsFor } from '../../../components/grid';

const GAP = 16;

export interface FitGridProps<T> {
  readonly items: readonly T[];
  readonly keyOf: (item: T) => string;
  readonly minItemWidth: number;
  readonly maxColumns: number;
  readonly renderItem: (item: T) => ReactNode;
  readonly fill?: boolean;
}

interface Box {
  readonly width: number;
  readonly height: number;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }
  return rows;
}

function fittingRows(heights: ReadonlyMap<number, number>, count: number, room: number): number {
  let used = 0;
  for (let index = 0; index < count; index += 1) {
    const height = heights.get(index);
    if (height === undefined) {
      return count;
    }
    used += height + (index === 0 ? 0 : GAP);
    if (used > room) {
      return Math.max(1, index);
    }
  }
  return count;
}

export function FitGrid<T>(props: FitGridProps<T>): ReactNode {
  const [box, setBox] = useState<Box | null>(null);
  const [heights, setHeights] = useState<ReadonlyMap<number, number>>(new Map());
  const columns =
    box === null ? 1 : columnsFor(box.width, props.minItemWidth, GAP, props.maxColumns);
  const rows = chunk(props.items, columns);
  const shown = box === null ? 0 : fittingRows(heights, rows.length, box.height);
  const stretch = props.fill === true && shown === rows.length;
  return (
    <View
      className="flex-1 gap-grid-gap overflow-hidden"
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setBox({ width, height });
      }}
    >
      {rows.slice(0, shown).map((row, index) => (
        <View
          key={row.map(props.keyOf).join(',')}
          className={stretch ? 'flex-1 flex-row gap-grid-gap' : 'flex-row gap-grid-gap'}
          onLayout={(event) => {
            const height = event.nativeEvent.layout.height;
            if (heights.get(index) !== height) {
              setHeights((current) => new Map(current).set(index, height));
            }
          }}
        >
          {Array.from({ length: columns }, (_, column) => {
            const item = row[column];
            return (
              <View
                key={item === undefined ? `gap-${String(column)}` : props.keyOf(item)}
                className="min-w-0 flex-1"
              >
                {item === undefined ? null : props.renderItem(item)}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}
