import type { ReactNode } from 'react';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { DriveItem } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { Icon } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { Segmented } from '../../../components/segmented';
import { Text } from '../../../components/text';
import { Zoomable, clampZoom, useZoomState, type ZoomState } from '../../../components/zoomable';
import { cn } from '../../../design/cn';
import { useIdiom } from '../../../design/platform';
import {
  IMAGE_MODE_LABEL,
  SWIPE_START,
  SWIPE_STEP,
  ZOOM_STEP,
  clampSplit,
  imageModesFor,
  swipeCaption,
  zoomPercent,
  type ImageMode,
} from './diff-model';
import { PickKey } from './version-timeline';
import type { PickSlot, VersionEntry } from './versions-model';

const log = new Logger('app.drive');

const HANDLE_HALF_PX = 22;

export interface ImageCompareProps {
  readonly item: DriveItem;
  readonly a: VersionEntry;
  readonly b: VersionEntry;
  readonly urls: { readonly a: string; readonly b: string };
}

function Picture({
  item,
  entry,
  slot,
  url,
  zoom,
}: {
  readonly item: DriveItem;
  readonly entry: VersionEntry;
  readonly slot: PickSlot;
  readonly url: string;
  readonly zoom: ZoomState;
}): ReactNode {
  return (
    <Zoomable state={zoom} className="size-full overflow-hidden">
      <Image
        source={{ uri: url }}
        contentFit="contain"
        cachePolicy="disk"
        recyclingKey={`${item.id}:${entry.key}`}
        onError={(event) => {
          log.warn('version_compare.image_failed', { slot, reason: event.error });
        }}
        style={StyleSheet.absoluteFill}
        accessibilityLabel={`${item.name}, version ${slot === 'a' ? 'A' : 'B'}`}
      />
    </Zoomable>
  );
}

function Key({
  slot,
  className,
}: {
  readonly slot: PickSlot;
  readonly className: string;
}): ReactNode {
  const pointer = useIdiom() === 'pointer';
  return (
    <View pointerEvents="none" className={cn('absolute top-2.5 rounded-xs bg-chrome', className)}>
      <PickKey slot={slot} pointer={pointer} />
    </View>
  );
}

function SideBySide({
  parts,
  zoom,
}: {
  readonly parts: ImageCompareProps;
  readonly zoom: ZoomState;
}): ReactNode {
  const { item, a, b, urls } = parts;
  return (
    <View className="min-h-0 flex-1 flex-row gap-3">
      <View className="min-w-0 flex-1 overflow-hidden rounded-md border-2 border-primary bg-surface-2">
        <Picture item={item} entry={a} slot="a" url={urls.a} zoom={zoom} />
        <Key slot="a" className="left-2.5" />
      </View>
      <View className="min-w-0 flex-1 overflow-hidden rounded-md border border-primary bg-surface-2">
        <Picture item={item} entry={b} slot="b" url={urls.b} zoom={zoom} />
        <Key slot="b" className="left-2.5" />
      </View>
    </View>
  );
}

function useSwipe(): {
  readonly split: SharedValue<number>;
  readonly width: SharedValue<number>;
  readonly drag: ReturnType<typeof Gesture.Pan>;
} {
  const split = useSharedValue(SWIPE_START);
  const width = useSharedValue(0);
  const start = useSharedValue(SWIPE_START);
  const drag = Gesture.Pan()
    .onBegin(() => {
      start.set(split.get());
    })
    .onUpdate((event) => {
      const span = width.get();
      if (span > 0) split.set(clampSplit(start.get() + event.translationX / span));
    });
  return { split, width, drag };
}

function SwipeHandle({ split, width, drag }: ReturnType<typeof useSwipe>): ReactNode {
  const placed = useAnimatedStyle(() => ({ left: split.get() * width.get() - HANDLE_HALF_PX }));
  const nudge = (step: number): void => {
    split.set(clampSplit(split.get() + step));
  };
  return (
    <GestureDetector gesture={drag}>
      <Animated.View
        style={placed}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Move between A and B"
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => {
          nudge(event.nativeEvent.actionName === 'increment' ? SWIPE_STEP : -SWIPE_STEP);
        }}
        className="absolute inset-y-0 w-11 items-center justify-center"
      >
        <View className="absolute inset-y-0 w-0.5 bg-primary" />
        <View className="size-9.5 items-center justify-center rounded-full bg-primary">
          <Icon name="grip" size={20} tone="onPrimary" />
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

function Swipe({
  parts,
  zoom,
}: {
  readonly parts: ImageCompareProps;
  readonly zoom: ZoomState;
}): ReactNode {
  const { item, a, b, urls } = parts;
  const swipe = useSwipe();
  const full = useAnimatedStyle(() => ({ width: swipe.width.get() }));
  const clipped = useAnimatedStyle(() => ({ width: (1 - swipe.split.get()) * swipe.width.get() }));
  return (
    <View
      onLayout={(event) => {
        swipe.width.set(event.nativeEvent.layout.width);
      }}
      className="min-h-0 flex-1 overflow-hidden rounded-md bg-surface-2"
    >
      <Picture item={item} entry={a} slot="a" url={urls.a} zoom={zoom} />
      <Animated.View
        pointerEvents="none"
        style={clipped}
        className="absolute inset-y-0 right-0 overflow-hidden"
      >
        <Animated.View style={full} className="absolute inset-y-0 right-0">
          <Picture item={item} entry={b} slot="b" url={urls.b} zoom={zoom} />
        </Animated.View>
      </Animated.View>
      <SwipeHandle {...swipe} />
      <Key slot="a" className="left-2.5" />
      <Key slot="b" className="right-2.5" />
    </View>
  );
}

function ZoomControls({ zoom }: { readonly zoom: ZoomState }): ReactNode {
  const [percent, setPercent] = useState(100);
  useAnimatedReaction(
    () => zoomPercent(zoom.zoom.get()),
    (now, before) => {
      if (now !== before) scheduleOnRN(setPercent, now);
    },
  );
  const step = (factor: number): void => {
    const next = clampZoom(zoom.zoom.get() * factor);
    zoom.zoom.set(next);
    if (next === 1) {
      zoom.x.set(0);
      zoom.y.set(0);
    }
  };
  return (
    <View className="flex-row items-center gap-1">
      <IconButton
        icon="minus"
        label="Zoom out"
        onPress={() => {
          step(1 / ZOOM_STEP);
        }}
      />
      <Text variant="footnote" tone="variant" className="min-w-12 text-center tabular-nums">
        {`${String(percent)} %`}
      </Text>
      <IconButton
        icon="plus"
        label="Zoom in"
        onPress={() => {
          step(ZOOM_STEP);
        }}
      />
    </View>
  );
}

export function ImageCompare(props: ImageCompareProps): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const modes = imageModesFor(pointer);
  const [mode, setMode] = useState<ImageMode>(modes[0] ?? 'side');
  const zoom = useZoomState();
  return (
    <View className={pointer ? 'min-h-0 flex-1 gap-3' : 'gap-3'}>
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Segmented
          label="Compare"
          options={modes.map((value) => ({ value, label: IMAGE_MODE_LABEL[value] }))}
          value={mode}
          onChange={setMode}
          fill={!pointer}
          size={pointer ? 'control' : 'touch'}
        />
        {pointer ? <ZoomControls zoom={zoom} /> : null}
      </View>
      <View className={pointer ? 'min-h-0 flex-1' : 'h-75'}>
        {mode === 'side' ? (
          <SideBySide parts={props} zoom={zoom} />
        ) : (
          <Swipe parts={props} zoom={zoom} />
        )}
      </View>
      <Text variant="footnote" tone="variant">
        {swipeCaption(mode)}
      </Text>
    </View>
  );
}
