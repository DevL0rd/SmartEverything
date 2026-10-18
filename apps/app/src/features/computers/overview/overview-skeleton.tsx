import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { Skeleton } from '../../../components/skeleton';
import { useIdiom } from '../../../design/platform';

const TILES = ['cpu', 'memory', 'disk', 'network'] as const;

export function OverviewSkeleton(): ReactNode {
  const pointer = useIdiom() === 'pointer';
  return (
    <View accessibilityLabel="Loading" aria-busy className="gap-section-gap">
      <Card>
        <View className="flex-row items-center gap-4">
          <Skeleton shape="circle" className={pointer ? 'size-28 shrink-0' : 'size-24 shrink-0'} />
          <View className="min-w-0 flex-1 gap-3">
            <Skeleton shape="text" />
            <Skeleton shape="line" />
            <Skeleton shape="line" />
          </View>
        </View>
      </Card>
      <View className="flex-row flex-wrap gap-2">
        {TILES.map((tile) => (
          <Skeleton key={tile} shape="block" className="h-16 min-w-36 flex-1" />
        ))}
      </View>
      <Skeleton shape="tile" />
    </View>
  );
}
