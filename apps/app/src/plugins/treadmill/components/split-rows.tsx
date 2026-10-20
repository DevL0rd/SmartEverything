import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { splitRows } from '../model/profile-model';

function growOf(share: number): { readonly flexGrow: number } {
  return { flexGrow: share };
}

function emptyOf(share: number): { readonly flexGrow: number } {
  return { flexGrow: 1 - share };
}

export function SplitRows({ splits }: { readonly splits: readonly number[] }): ReactNode {
  const rows = splitRows(splits);
  if (rows.length === 0) {
    return (
      <Text variant="callout" tone="variant">
        Splits appear for sessions longer than one kilometre.
      </Text>
    );
  }
  return (
    <View className="gap-2">
      {rows.map((row) => (
        <View
          key={row.km}
          accessible
          accessibilityLabel={`Kilometre ${String(row.km)}, ${row.pace}${row.fast ? ', fastest' : ''}`}
          className="flex-row items-center gap-3"
        >
          <Text variant="caption" tone="variant" className="tabular w-10">
            km {row.km}
          </Text>
          <View className="h-3 flex-1 flex-row">
            <View
              style={growOf(row.share)}
              className={cn('h-full basis-0 rounded-full', row.fast ? 'bg-positive' : 'bg-primary')}
            />
            <View style={emptyOf(row.share)} className="basis-0" />
          </View>
          <Text variant="caption" className="tabular w-20 text-right">
            {row.pace}
          </Text>
        </View>
      ))}
      <Text variant="caption" tone="faint">
        Longer bars are faster kilometres.
      </Text>
    </View>
  );
}
