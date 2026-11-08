import type { TimelineBucket } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { memo, useEffect, useMemo, useState } from 'react';
import {
  View,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';
import { useColour } from '../../design/colour';
import { useIdiom } from '../../design/platform';
import { selectionTick } from '../../platform/haptics';
import { Text } from '../text';
import {
  clampShare,
  densityPath,
  itemAt,
  labelledTicks,
  pillText,
  pointAt,
  scrubberModel,
  shareOfItem,
  stepMonth,
  type ScrubberModel,
  type ScrubPoint,
} from './scrubber-model';

export const SCRUBBER_WIDTH = 44;

const THUMB_LENGTH = 44;
const PILL_HALF = 16;
const DENSITY_OPACITY = 0.14;

export interface ScrubAt {
  readonly month: string;
  readonly item: number;
}

export interface ScrubberProps {
  readonly buckets: readonly TimelineBucket[];
  readonly at: ScrubAt | null;
  readonly onScrub: (point: ScrubPoint) => void;
  readonly onRelease: (point: ScrubPoint) => void;
}

interface Track {
  readonly share: SharedValue<number>;
  readonly height: SharedValue<number>;
}

interface Scrub extends Track {
  readonly gesture: ReturnType<typeof Gesture.Simultaneous>;
  readonly pill: ScrubPoint | null;
  readonly dragging: boolean;
}

function useFollow(model: ScrubberModel, at: ScrubAt | null, track: Track, held: boolean): void {
  const { share } = track;
  useEffect(() => {
    if (held || at === null) return;
    const next = shareOfItem(model, at.month, at.item);
    if (next !== null) share.set(next);
  }, [model, at, held, share]);
}

interface Moves {
  readonly share: SharedValue<number>;
  readonly height: SharedValue<number>;
  readonly total: number;
  readonly pointer: boolean;
  readonly preview: (next: number) => void;
  readonly settle: (next: number) => void;
  readonly hover: (on: boolean) => void;
}

function useScrubGesture(moves: Moves): Scrub['gesture'] {
  const { share, height, total, pointer, preview, settle, hover } = moves;
  const start = useSharedValue(0);
  const last = useSharedValue(-1);
  const move = (next: number): void => {
    'worklet';
    const clamped = clampShare(next);
    share.set(clamped);
    const item = itemAt(total, clamped);
    if (item !== last.get()) {
      last.set(item);
      scheduleOnRN(preview, clamped);
    }
  };
  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((event) => {
      start.set(share.get());
      if (pointer) move(event.y / Math.max(1, height.get()));
    })
    .onUpdate((event) => {
      const size = Math.max(1, height.get());
      move(pointer ? event.y / size : start.get() + event.translationY / size);
    })
    .onFinalize(() => {
      last.set(-1);
      scheduleOnRN(settle, share.get());
    });
  const hovering = Gesture.Hover()
    .enabled(pointer)
    .onBegin(() => {
      scheduleOnRN(hover, true);
    })
    .onFinalize(() => {
      scheduleOnRN(hover, false);
    });
  return Gesture.Simultaneous(pan, hovering);
}

function useScrub(model: ScrubberModel, props: ScrubberProps, pointer: boolean): Scrub {
  const share = useSharedValue(0);
  const height = useSharedValue(0);
  const [pill, setPill] = useState<ScrubPoint | null>(null);
  const [hovered, setHovered] = useState(false);
  useFollow(model, props.at, { share, height }, pill !== null);
  const preview = (next: number): void => {
    const point = pointAt(model, next);
    if (point === null) return;
    if (point.index !== pill?.index) selectionTick();
    setPill(point);
    props.onScrub(point);
  };
  const settle = (next: number): void => {
    const point = pointAt(model, next);
    setPill(null);
    if (point !== null) props.onRelease(point);
  };
  const gesture = useScrubGesture({
    share,
    height,
    total: model.total,
    pointer,
    preview,
    settle,
    hover: setHovered,
  });
  return { gesture, share, height, pill, dragging: pill !== null || hovered };
}

interface LayerProps {
  readonly model: ScrubberModel;
  readonly height: number;
}

function topOf(top: number): ViewStyle {
  return { top };
}

function DensityLayer({ model, height }: LayerProps): ReactNode {
  const fill = useColour('viz-1');
  const path = densityPath(model, SCRUBBER_WIDTH, height);
  if (path === '') return null;
  return (
    <View pointerEvents="none" className="absolute inset-0">
      <Svg width={SCRUBBER_WIDTH} height={height} aria-hidden>
        <Path d={path} fill={fill} fillOpacity={DENSITY_OPACITY} />
      </Svg>
    </View>
  );
}

const Density = memo(DensityLayer);

function YearLayer({ model, height }: LayerProps): ReactNode {
  return labelledTicks(model.ticks, height).map((tick) => (
    <View
      key={tick.year}
      pointerEvents="none"
      style={topOf(tick.at * height)}
      className="absolute right-1.5"
    >
      <Text variant="caption" tone="variant" className="tabular">
        {tick.year}
      </Text>
    </View>
  ));
}

const Years = memo(YearLayer);

function Thumb({
  track,
  pointer,
  gesture,
}: {
  readonly track: Track;
  readonly pointer: boolean;
  readonly gesture: Scrub['gesture'];
}): ReactNode {
  const { share, height } = track;
  const lead = pointer ? 1 : THUMB_LENGTH / 2;
  const moved = useAnimatedStyle(() => ({
    transform: [{ translateY: share.get() * height.get() - lead }],
  }));
  if (pointer) {
    return (
      <Animated.View
        pointerEvents="none"
        style={moved}
        className="absolute left-0 right-0 top-0 h-0.5 bg-primary"
      />
    );
  }
  return (
    <GestureDetector gesture={gesture} touchAction="none">
      <Animated.View style={moved} className="absolute right-0 top-0 h-11 w-11 items-end">
        <View className="mr-0.5 h-11 w-1 rounded-full bg-on-surface-faint" />
      </Animated.View>
    </GestureDetector>
  );
}

function Pill({ track, point }: { readonly track: Track; readonly point: ScrubPoint }): ReactNode {
  const { share, height } = track;
  const moved = useAnimatedStyle(() => ({
    transform: [{ translateY: share.get() * height.get() - PILL_HALF }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={moved}
      className="absolute right-12.5 top-0 h-8 flex-row items-center rounded-full border-hairline border-outline-variant bg-surface-raised px-3 elevation-2"
    >
      <Text variant="label" numberOfLines={1} className="tabular">
        {pillText(point.month, point.count)}
      </Text>
    </Animated.View>
  );
}

function useNudge(
  model: ScrubberModel,
  props: ScrubberProps,
  share: SharedValue<number>,
): (event: AccessibilityActionEvent) => void {
  return (event) => {
    const by = event.nativeEvent.actionName === 'increment' ? -1 : 1;
    const next = stepMonth(model, share.get(), by);
    const point = next === null ? null : pointAt(model, next);
    if (next === null || point === null) return;
    share.set(next);
    props.onRelease(point);
  };
}

function currentPoint(model: ScrubberModel, scrub: Scrub, at: ScrubAt | null): ScrubPoint | null {
  if (scrub.pill !== null) return scrub.pill;
  const share = at === null ? null : shareOfItem(model, at.month, at.item);
  return share === null ? null : pointAt(model, share);
}

function Strip({
  model,
  scrub,
  pointer,
  current,
}: {
  readonly model: ScrubberModel;
  readonly scrub: Scrub;
  readonly pointer: boolean;
  readonly current: ScrubPoint | null;
}): ReactNode {
  const [height, setHeight] = useState(0);
  const measure = (event: LayoutChangeEvent): void => {
    scrub.height.set(event.nativeEvent.layout.height);
    setHeight(event.nativeEvent.layout.height);
  };
  return (
    <View onLayout={measure} pointerEvents="box-none" className="flex-1">
      {pointer || scrub.dragging ? (
        <>
          <Density model={model} height={height} />
          <Years model={model} height={height} />
        </>
      ) : null}
      <Thumb track={scrub} pointer={pointer} gesture={scrub.gesture} />
      {scrub.dragging && current !== null ? <Pill track={scrub} point={current} /> : null}
    </View>
  );
}

interface TrackProps extends ScrubberProps {
  readonly model: ScrubberModel;
}

function ScrubberTrack(props: TrackProps): ReactNode {
  const { model } = props;
  const pointer = useIdiom() === 'pointer';
  const scrub = useScrub(model, props, pointer);
  const onAction = useNudge(model, props, scrub.share);
  const current = currentPoint(model, scrub, props.at);
  const strip = <Strip model={model} scrub={scrub} pointer={pointer} current={current} />;
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Timeline scrubber"
      accessibilityValue={{ text: current === null ? '' : pillText(current.month, current.count) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={onAction}
      pointerEvents="box-none"
      className="absolute bottom-0 right-0 top-0 w-11"
    >
      {pointer ? (
        <GestureDetector gesture={scrub.gesture} touchAction="none">
          <View className="flex-1">{strip}</View>
        </GestureDetector>
      ) : (
        strip
      )}
    </View>
  );
}

export function Scrubber(props: ScrubberProps): ReactNode {
  const model = useMemo(() => scrubberModel(props.buckets), [props.buckets]);
  return model.total === 0 ? null : <ScrubberTrack {...props} model={model} />;
}
