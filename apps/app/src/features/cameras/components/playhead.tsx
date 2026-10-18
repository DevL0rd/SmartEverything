import type { ReactNode } from 'react';
import { Image, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { eventLook } from '../../activity';
import { fractionTime, nearest, type TrackItem } from '../logic/timeline-track';

const HANDLE = 24;

export interface PlayheadProps {
  readonly fraction: number;
  readonly width: number;
  readonly onMove: (fraction: number) => void;
  readonly onRelease: (fraction: number) => void;
}

function clamp01(value: number): number {
  'worklet';
  return Math.min(1, Math.max(0, value));
}

function placeOf(left: number): { readonly left: number } {
  return { left };
}

export function Playhead({ fraction, width, onMove, onRelease }: PlayheadProps): ReactNode {
  const start = useSharedValue(0);
  const drag = Gesture.Pan()
    .runOnJS(true)
    .onBegin(() => {
      start.set(fraction);
    })
    .onUpdate((event) => {
      onMove(clamp01(start.get() + event.translationX / Math.max(1, width)));
    })
    .onEnd((event) => {
      onRelease(clamp01(start.get() + event.translationX / Math.max(1, width)));
    });
  return (
    <View
      style={placeOf(fraction * width - HANDLE / 2)}
      className="absolute bottom-0 top-0 w-6 items-center justify-end pb-1"
    >
      <View className="absolute bottom-0 top-0 w-0.5 bg-critical" />
      <GestureDetector gesture={drag}>
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={`Playhead at ${fractionTime(fraction)}`}
          className="size-6 rounded-full border-2 border-critical bg-surface-raised"
        />
      </GestureDetector>
    </View>
  );
}

export function ScrubPreview({
  items,
  fraction,
}: {
  readonly items: readonly TrackItem[];
  readonly fraction: number;
}): ReactNode {
  const item = nearest(items, fraction);
  return (
    <View className="flex-row items-center gap-3 rounded-lg bg-surface-2 p-2">
      <View className="aspect-video w-24 items-center justify-center overflow-hidden rounded-sm bg-surface-3">
        {item?.thumb === null || item === null ? (
          <Icon
            name={item === null ? 'clock' : eventLook(item.kind, item.details).icon}
            size={20}
          />
        ) : (
          <Image
            resizeMethod="resize"
            source={{ uri: item.thumb }}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
            className="h-full w-full"
          />
        )}
      </View>
      <View className="min-w-0 flex-1">
        <Text variant="body-strong" numberOfLines={1}>
          {item === null
            ? fractionTime(fraction)
            : `${eventLook(item.kind, item.details).label} · ${item.time}`}
        </Text>
        <Text variant="footnote" tone="variant" numberOfLines={1}>
          {item === null ? 'Nothing here' : 'Let go to open'}
        </Text>
      </View>
    </View>
  );
}
