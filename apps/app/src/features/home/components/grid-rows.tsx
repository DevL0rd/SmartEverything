import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import { chunk } from './fit-math';

export interface GridRowsProps<T> {
  readonly items: readonly T[];
  readonly keyOf: (item: T) => string;
  readonly columns: number;
  readonly renderItem: (item: T) => ReactNode;
  readonly rowHeight?: number;
}

function heightOf(height: number): ViewStyle {
  return { height };
}

export function GridRows<T>({
  items,
  keyOf,
  columns,
  renderItem,
  rowHeight,
}: GridRowsProps<T>): ReactNode {
  return (
    <View className="flex-1 gap-grid-gap">
      {chunk(items, columns).map((row) => (
        <View
          key={row.map(keyOf).join(',')}
          className={
            rowHeight === undefined ? 'flex-1 flex-row gap-grid-gap' : 'flex-row gap-grid-gap'
          }
          style={rowHeight === undefined ? undefined : heightOf(rowHeight)}
        >
          {Array.from({ length: columns }, (_, column) => {
            const item = row[column];
            return (
              <View
                key={item === undefined ? `gap-${String(column)}` : keyOf(item)}
                className="min-w-0 flex-1"
              >
                {item === undefined ? null : renderItem(item)}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}
