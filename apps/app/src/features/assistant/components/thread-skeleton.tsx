import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Skeleton } from '../../../components/skeleton';

export function ThreadSkeleton(): ReactNode {
  return (
    <View
      accessibilityLabel="Loading messages"
      className="w-full max-w-reading flex-1 justify-end gap-6 self-center px-gutter pb-6"
    >
      <View className="items-end pl-24">
        <Skeleton shape="block" className="h-14 w-3/4 rounded-xl" />
      </View>
      <View className="gap-2">
        <Skeleton shape="line" />
        <Skeleton shape="line" className="w-5/6" />
        <Skeleton shape="line" className="w-2/3" />
      </View>
      <View className="gap-2">
        <Skeleton shape="line" className="w-4/5" />
        <Skeleton shape="line" className="w-1/2" />
      </View>
    </View>
  );
}
