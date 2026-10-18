import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useAnimationGate } from '../../../design/animation-gate';
import { useScopeVisible } from '../../../design/visibility';
import { RING, loopStyle } from '../../../design/loops';
import { useStoreSelector } from '../../../store/store-context';
import type { StoreState } from '../../../store/state';
import { Overline } from '../components/overline';

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
          className="absolute -inset-1 rounded-full border-2 border-positive"
        />
      ) : null}
    </View>
  );
}

export function LiveCaption(): ReactNode {
  const live = useStoreSelector(selectLive);
  return (
    <View className="flex-row items-center gap-1.5 px-0.5">
      <LiveDot live={live} />
      <Overline>{live ? 'Live' : 'Offline'}</Overline>
    </View>
  );
}
