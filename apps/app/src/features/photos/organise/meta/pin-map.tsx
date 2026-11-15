import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { IconButton } from '../../../../components/icon-button';
import { Text } from '../../../../components/text';
import {
  MAP_ZOOM_MAX,
  mapBoxOf,
  pannedBy,
  pinchSteps,
  zoomedBy,
  type MapView,
} from '../../places/map-view';
import { useMapWheel } from '../../places/use-map-wheel';
import { NATURAL_EARTH_ATTRIBUTION } from '../../world-map';
import type { FrameSize, GeoPoint } from '../../world-map/projection';
import { useMapFrame } from '../../world-map/use-map-frame';
import { WorldBase } from '../../world-map/world-base';
import { pinAt, pointAt } from './pick-model';

const PIN_HALF = 14;

export interface PinMapProps {
  readonly view: MapView;
  readonly onView: (view: MapView) => void;
  readonly pin: GeoPoint | null;
  readonly onPick: (point: GeoPoint) => void;
}

function useGestures(
  props: PinMapProps,
  frame: FrameSize,
): {
  readonly gesture: ReturnType<typeof Gesture.Simultaneous>;
  readonly moved: ReturnType<typeof useAnimatedStyle<ViewStyle>>;
} {
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const commitPan = (dx: number, dy: number): void => {
    x.set(0);
    y.set(0);
    props.onView(pannedBy(props.view, dx, dy, frame));
  };
  const commitTap = (atX: number, atY: number): void => {
    props.onPick(pointAt({ x: atX, y: atY }, props.view, frame));
  };
  const commitPinch = (scale: number): void => {
    const steps = pinchSteps(scale);
    if (steps !== 0) props.onView(zoomedBy(props.view, steps));
  };
  const pan = Gesture.Pan()
    .enabled(props.view.zoom > 0)
    .onUpdate((event) => {
      x.set(event.translationX);
      y.set(event.translationY);
    })
    .onEnd((event) => {
      scheduleOnRN(commitPan, event.translationX, event.translationY);
    });
  const tap = Gesture.Tap().onEnd((event) => {
    scheduleOnRN(commitTap, event.x, event.y);
  });
  const pinch = Gesture.Pinch().onEnd((event) => {
    scheduleOnRN(commitPinch, event.scale);
  });
  const moved = useAnimatedStyle<ViewStyle>(() => ({
    transform: [{ translateX: x.get() }, { translateY: y.get() }],
  }));
  return { gesture: Gesture.Exclusive(pan, Gesture.Simultaneous(tap, pinch)), moved };
}

function Pin({
  point,
  map,
  frame,
}: {
  readonly point: GeoPoint;
  readonly map: PinMapProps;
  readonly frame: FrameSize;
}): ReactNode {
  const at = pinAt(point, map.view, frame);
  const spot = { left: at.x - PIN_HALF, top: at.y - PIN_HALF };
  return (
    <View
      pointerEvents="none"
      className="absolute size-7 items-center justify-center rounded-full bg-primary/30"
      style={spot}
    >
      <View className="size-3 rounded-full border border-surface-1 bg-primary" />
    </View>
  );
}

function Layers({
  map,
  frame,
}: {
  readonly map: PinMapProps;
  readonly frame: FrameSize;
}): ReactNode {
  const { gesture, moved } = useGestures(map, frame);
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={moved} className="size-full">
        <WorldBase view={mapBoxOf(map.view, frame)} frame={frame} />
        {map.pin === null ? null : <Pin point={map.pin} map={map} frame={frame} />}
      </Animated.View>
    </GestureDetector>
  );
}

export function PinMap(props: PinMapProps): ReactNode {
  const { ref, frame, onLayout } = useMapFrame();
  useMapWheel(ref, 'ctrl-wheel', props, frame);
  return (
    <View
      ref={ref}
      collapsable={false}
      onLayout={onLayout}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Map. Tap where the photo was taken."
      className="h-56 overflow-hidden rounded-md bg-surface-1"
    >
      {frame === null ? null : <Layers map={props} frame={frame} />}
      <View className="absolute right-2 top-2 gap-1 rounded-md border-hairline border-outline-variant bg-surface-raised p-0.5">
        <IconButton
          icon="plus"
          label="Zoom in"
          disabled={props.view.zoom >= MAP_ZOOM_MAX}
          onPress={() => {
            props.onView(zoomedBy(props.view, 1));
          }}
        />
        <IconButton
          icon="minus"
          label="Zoom out"
          disabled={props.view.zoom === 0}
          onPress={() => {
            props.onView(zoomedBy(props.view, -1));
          }}
        />
      </View>
      <View pointerEvents="none" className="absolute bottom-1.5 left-2.5">
        <Text variant="caption" tone="variant">
          {NATURAL_EARTH_ATTRIBUTION}
        </Text>
      </View>
    </View>
  );
}
