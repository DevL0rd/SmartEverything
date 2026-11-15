import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Skeleton } from '../../../components/skeleton';
import { cn } from '../../../design/cn';

const SKELETON_ROWS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;

function RowSkeleton(): ReactNode {
  return (
    <View className="h-row-h-2 flex-row items-center gap-3 px-4">
      <Skeleton shape="circle" />
      <View className="min-w-0 flex-1 gap-2">
        <Skeleton shape="text" className="w-3/5" />
        <Skeleton shape="text" className="w-2/5" />
      </View>
    </View>
  );
}

export function ActivityLoading({
  compact,
  wide,
}: {
  readonly compact: boolean;
  readonly wide: boolean;
}): ReactNode {
  return (
    <View aria-busy className="gap-4" accessibilityLabel="Loading Activity">
      <Skeleton shape="block" className={cn('h-10 rounded-full', compact ? 'w-full' : 'w-72')} />
      <View className="gap-4 large:flex-row">
        <Skeleton shape="tile" className="h-60 large:flex-3" />
        <View className="gap-4 large:flex-2">
          <Skeleton shape="tile" className="h-44" />
          {wide ? <Skeleton shape="tile" className="h-36" /> : null}
        </View>
      </View>
      <Skeleton shape="block" className="h-10 rounded-full" />
      <View className="overflow-hidden rounded-lg border border-outline-variant bg-surface-1 py-2">
        {SKELETON_ROWS.map((key) => (
          <RowSkeleton key={key} />
        ))}
      </View>
    </View>
  );
}
