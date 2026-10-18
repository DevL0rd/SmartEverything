import type { ReactNode } from 'react';
import { View } from 'react-native';

export function rowsOfCards<T>(items: readonly T[], columns: number): readonly (readonly T[])[] {
  const rows: T[][] = [];
  items.forEach((item, index) => {
    if (index % columns === 0) rows.push([item]);
    else rows.at(-1)?.push(item);
  });
  return rows;
}

export function CardGrid<T>({
  items,
  columns,
  keyOf,
  render,
}: {
  readonly items: readonly T[];
  readonly columns: number;
  readonly keyOf: (item: T) => string;
  readonly render: (item: T) => ReactNode;
}): ReactNode {
  return (
    <View className="gap-4">
      {rowsOfCards(items, columns).map((row) => (
        <View key={row.map(keyOf).join()} className="flex-row items-start gap-4">
          {row.map((item) => (
            <View key={keyOf(item)} className="min-w-0 flex-1">
              {render(item)}
            </View>
          ))}
          {row.length < columns ? <View className="min-w-0 flex-1" /> : null}
        </View>
      ))}
    </View>
  );
}
