import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Skeleton } from '../../../components/skeleton';
import type { FrameClass } from '../../../components/widget-board';

function Bars({ rows }: { readonly rows: number }): ReactNode {
  return (
    <View className="gap-2">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} shape="line" className={index === 0 ? 'w-2/3' : 'w-full'} />
      ))}
    </View>
  );
}

export function FaceSkeleton({ cls }: { readonly cls: FrameClass }): ReactNode {
  return (
    <View accessibilityLabel="Loading" aria-busy className="flex-1 gap-3">
      <View className="flex-row items-center gap-2.5">
        <Skeleton shape="circle" />
        <Skeleton shape="text" />
      </View>
      {cls === 's' ? <Bars rows={3} /> : null}
      {cls === 'xs' || cls === 'm' || cls === 'w' ? <Bars rows={2} /> : null}
      {cls === 'l' || cls === 'xl' ? (
        <View className="flex-1 gap-3">
          <View className="flex-row gap-3">
            <Skeleton shape="block" className="flex-1" />
            <Skeleton shape="block" className="flex-1" />
          </View>
          <Bars rows={2} />
        </View>
      ) : null}
    </View>
  );
}
