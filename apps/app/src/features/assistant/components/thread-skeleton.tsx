import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { cn } from '../../../design/cn';
import { useAnimationGate } from '../../../design/animation-gate';
import { BREATHE, EASE_IN_OUT, loopStyle, type Loop } from '../../../design/loops';
import { useScopeVisible } from '../../../design/visibility';

const SHIMMER: Loop = { name: BREATHE, ms: 800, easing: EASE_IN_OUT, alternate: true };

const BONE = 'bg-surface-2';

const LINE = cn(BONE, 'h-3 rounded-full');

function OwnBone({ className }: { readonly className: string }): ReactNode {
  return (
    <View className="items-end">
      <View className={cn(BONE, 'max-w-17/20 rounded-bubble rounded-br-tail', className)} />
    </View>
  );
}

function ReplyBone({ widths }: { readonly widths: readonly string[] }): ReactNode {
  return (
    <View className="gap-1">
      {widths.map((width) => (
        <View key={width} className={cn(LINE, width)} />
      ))}
    </View>
  );
}

export function ThreadSkeleton(): ReactNode {
  const { moving } = useAnimationGate(true, useScopeVisible());
  return (
    <View
      accessibilityLabel="Loading messages"
      className="w-full flex-1 justify-end px-gutter pb-4"
    >
      <Animated.View aria-hidden style={loopStyle(SHIMMER, moving)} className="gap-4">
        <OwnBone className="h-9.5 w-45" />
        <View className="gap-2">
          <View className={cn(BONE, 'h-3.5 w-37.5 rounded-full')} />
          <ReplyBone widths={['w-full', 'w-23/25', 'w-16/25']} />
        </View>
        <OwnBone className="h-15 w-60" />
        <ReplyBone widths={['w-full', 'w-39/50']} />
      </Animated.View>
    </View>
  );
}
