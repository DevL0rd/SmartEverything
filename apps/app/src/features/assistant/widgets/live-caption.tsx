import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Text } from '../../../components/text';
import { useAnimationGate } from '../../../design/animation-gate';
import { useScopeVisible } from '../../../design/visibility';
import { RING, loopStyle } from '../../../design/loops';
import { useStoreSelector } from '../../../store/store-context';
import type { StoreState } from '../../../store/state';

const RING_MS = 1800;

const selectLive = (state: StoreState): boolean => state.sync.status === 'live';

function LiveDot({ live }: { readonly live: boolean }): ReactNode {
  const { moving: running } = useAnimationGate(live, useScopeVisible());
  return (
    <View aria-hidden className="size-1.5 items-center justify-center">
      <View
        className={live ? 'size-1.5 rounded-full bg-positive' : 'size-1.5 rounded-full bg-outline'}
      />
      {live ? (
        <Animated.View
          style={loopStyle({ name: RING, ms: RING_MS, easing: 'ease-out' }, running)}
          className="absolute -inset-1 rounded-full border border-positive"
        />
      ) : null}
    </View>
  );
}

export function LiveCaption(): ReactNode {
  const live = useStoreSelector(selectLive);
  return (
    <View className="flex-row items-center gap-1.5">
      <LiveDot live={live} />
      <Text variant="footnote" tone={live ? 'variant' : 'faint'} numberOfLines={1}>
        {live ? 'Live' : 'Offline'}
      </Text>
    </View>
  );
}
