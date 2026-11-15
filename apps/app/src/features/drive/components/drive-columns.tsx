import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import type { PlacedColumn } from '../model/drive-columns';

export function DriveCells<K extends string>({
  columns,
  cell,
}: {
  readonly columns: readonly PlacedColumn<K>[];
  readonly cell: (column: PlacedColumn<K>) => ReactNode;
}): ReactNode {
  return (
    <View className="flex-row items-center gap-4">
      {columns.map((column) => (
        <View
          key={column.key}
          style={{ width: column.width }}
          className={cn('justify-center', column.end ? 'items-end' : 'items-start')}
        >
          {cell(column)}
        </View>
      ))}
    </View>
  );
}

function Heading({ text, end }: { readonly text: string; readonly end: boolean }): ReactNode {
  return (
    <Text variant="caption" tone="variant" numberOfLines={1} align={end ? 'end' : 'start'}>
      {text}
    </Text>
  );
}

export function DriveColumnHead<K extends string>({
  columns,
}: {
  readonly columns: readonly PlacedColumn<K>[];
}): ReactNode {
  return (
    <View className="min-h-9 flex-row items-center border-b border-outline-variant bg-surface-2 pl-4 pr-1">
      <View className="min-w-0 flex-1 flex-row items-center gap-3">
        <View className="w-8" />
        <View className="min-w-0 flex-1">
          <Heading text="Name" end={false} />
        </View>
        <DriveCells
          columns={columns}
          cell={(column) => <Heading text={column.title} end={column.end} />}
        />
      </View>
      <View className="w-touch-min" />
    </View>
  );
}
