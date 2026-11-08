import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { cn } from '../../../design/cn';
import { useMotion } from '../../../design/motion';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import type { MemoryMedia } from './items';
import { MemoryPicture } from './memory-picture';
import {
  FADE_MS,
  SLIDE_MS,
  SLOW_ZOOM,
  segmentFillOf,
  segmentsFit,
  type SegmentFill,
} from './player-model';

function Layer({
  item,
  progress,
  reduced,
}: {
  readonly item: MemoryMedia;
  readonly progress: SharedValue<number>;
  readonly reduced: boolean;
}): ReactNode {
  const look = useAnimatedStyle(() => {
    const at = progress.get();
    return {
      opacity: reduced ? 1 : Math.min(1, (at * SLIDE_MS) / FADE_MS),
      transform: [{ scale: reduced ? 1 : 1 + SLOW_ZOOM * at }],
    };
  });
  return (
    <Animated.View className="absolute inset-0" style={look}>
      <MemoryPicture item={item} size="preview" stage className="size-full" />
    </Animated.View>
  );
}

export function PlayerStage({
  current,
  previous,
  progress,
}: {
  readonly current: MemoryMedia | null;
  readonly previous: MemoryMedia | null;
  readonly progress: SharedValue<number>;
}): ReactNode {
  const { reduced } = useMotion();
  return (
    <View className="absolute inset-0 overflow-hidden bg-black">
      {previous === null ? null : (
        <MemoryPicture item={previous} size="preview" stage className="absolute inset-0" />
      )}
      {current === null ? null : (
        <Layer key={current.id} item={current} progress={progress} reduced={reduced} />
      )}
      <View
        pointerEvents="none"
        className="absolute inset-x-0 top-0 h-48 bg-linear-to-b from-black/60 to-transparent"
      />
      <View
        pointerEvents="none"
        className="absolute inset-x-0 bottom-0 h-72 bg-linear-to-t from-black/70 to-transparent"
      />
    </View>
  );
}

const FILL: Readonly<Record<SegmentFill, string>> = {
  done: 'bg-white',
  current: 'bg-white/30',
  left: 'bg-white/30',
};

function Running({
  progress,
  offset,
  total,
}: {
  readonly progress: SharedValue<number>;
  readonly offset: number;
  readonly total: number;
}): ReactNode {
  const look = useAnimatedStyle(() => ({
    transformOrigin: 'left',
    transform: [{ scaleX: (offset + progress.get()) / total }],
  }));
  return <Animated.View className="absolute inset-0 bg-white" style={look} />;
}

function Segments({
  index,
  total,
  progress,
}: {
  readonly index: number;
  readonly total: number;
  readonly progress: SharedValue<number>;
}): ReactNode {
  return (
    <View className="h-1 flex-row gap-0.5">
      {Array.from({ length: total }, (_, segment) => {
        const fill = segmentFillOf(segment, index);
        return (
          <View key={segment} className={cn('h-1 flex-1 overflow-hidden rounded-full', FILL[fill])}>
            {fill === 'current' ? <Running progress={progress} offset={0} total={1} /> : null}
          </View>
        );
      })}
    </View>
  );
}

export function PlayerProgress({
  index,
  total,
  progress,
}: {
  readonly index: number;
  readonly total: number;
  readonly progress: SharedValue<number>;
}): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  return (
    <View
      onLayout={onLayout}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {segmentsFit(total, width) ? (
        <Segments index={index} total={total} progress={progress} />
      ) : (
        <View className="h-1 overflow-hidden rounded-full bg-white/30">
          <Running progress={progress} offset={index} total={Math.max(total, 1)} />
        </View>
      )}
    </View>
  );
}
