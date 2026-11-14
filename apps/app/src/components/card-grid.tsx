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

export function emptySlotsOf(filled: number, columns: number): readonly number[] {
  return Array.from({ length: Math.max(0, columns - filled) }, (_, slot) => filled + slot);
}

export function evenColumnsOf(count: number, most: number): number {
  if (count <= most) return most;
  return Math.ceil(count / Math.ceil(count / most));
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
          {emptySlotsOf(row.length, columns).map((slot) => (
            <View key={`empty-${String(slot)}`} className="min-w-0 flex-1" />
          ))}
        </View>
      ))}
    </View>
  );
}
