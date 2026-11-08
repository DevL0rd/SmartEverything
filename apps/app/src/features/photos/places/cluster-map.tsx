import { useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { PlaceCluster } from '@smarteverything/domain';
import { IconButton } from '../../../components/icon-button';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { ClusterMarker } from '../world-map/cluster-marker';
import { clusterMarks } from '../world-map/clusters';
import { fitOf, placeOf, type FrameSize } from '../world-map/projection';
import { useMapFrame } from '../world-map/use-map-frame';
import { WorldBase } from '../world-map/world-base';
import {
  cardSpot,
  MAP_ZOOM_MAX,
  mapBoxOf,
  pannedBy,
  pinchSteps,
  zoomedBy,
  type CardSize,
  type MapView,
} from './map-view';

export interface ClusterMapProps {
  readonly view: MapView;
  readonly onView: (view: MapView) => void;
  readonly onFrame: (frame: FrameSize) => void;
  readonly clusters: readonly PlaceCluster[];
  readonly selected: PlaceCluster | null;
  readonly onSelect: (cluster: PlaceCluster | null) => void;
  readonly card: ReactNode;
  readonly label: string;
  readonly attribution: string;
  readonly className?: string;
}

interface MapGestures {
  readonly gesture: ReturnType<typeof Gesture.Simultaneous>;
  readonly moved: ReturnType<typeof useAnimatedStyle<ViewStyle>>;
}

function useMapGestures(props: ClusterMapProps, frame: FrameSize | null): MapGestures {
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const commitPan = (dx: number, dy: number): void => {
    x.set(0);
    y.set(0);
    if (frame !== null) props.onView(pannedBy(props.view, dx, dy, frame));
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
  const pinch = Gesture.Pinch().onEnd((event) => {
    scheduleOnRN(commitPinch, event.scale);
  });
  const moved = useAnimatedStyle<ViewStyle>(() => ({
    transform: [{ translateX: x.get() }, { translateY: y.get() }],
  }));
  return { gesture: Gesture.Simultaneous(pan, pinch), moved };
}

function ZoomButtons({ map }: { readonly map: ClusterMapProps }): ReactNode {
  return (
    <View className="absolute right-3 top-3 gap-1 rounded-md border-hairline border-outline-variant bg-surface-raised p-0.5">
      <IconButton
        icon="plus"
        label="Zoom in"
        disabled={map.view.zoom >= MAP_ZOOM_MAX}
        onPress={() => {
          map.onView(zoomedBy(map.view, 1));
        }}
      />
      <IconButton
        icon="minus"
        label="Zoom out"
        disabled={map.view.zoom === 0}
        onPress={() => {
          map.onView(zoomedBy(map.view, -1));
        }}
      />
    </View>
  );
}

function SelectedCard({
  map,
  frame,
}: {
  readonly map: ClusterMapProps;
  readonly frame: FrameSize;
}): ReactNode {
  const [size, setSize] = useState<CardSize>({ width: 300, height: 200 });
  if (map.selected === null) return null;
  const at = placeOf(map.selected, fitOf(mapBoxOf(map.view, frame), frame));
  const spot = cardSpot(at, frame, size);
  return (
    <View
      className="absolute w-75 max-w-full"
      style={spot}
      onLayout={(event: LayoutChangeEvent) => {
        const { width, height } = event.nativeEvent.layout;
        if (width !== size.width || height !== size.height) setSize({ width, height });
      }}
    >
      {map.card}
    </View>
  );
}

function Layers({
  map,
  frame,
}: {
  readonly map: ClusterMapProps;
  readonly frame: FrameSize;
}): ReactNode {
  const { gesture, moved } = useMapGestures(map, frame);
  const box = mapBoxOf(map.view, frame);
  const marks = clusterMarks(map.clusters, fitOf(box, frame));
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={moved} className="size-full">
        <View accessible accessibilityRole="image" accessibilityLabel={map.label}>
          <WorldBase view={box} frame={frame} />
        </View>
        {marks.map((mark) => (
          <ClusterMarker
            key={mark.cluster.geohash}
            mark={mark}
            selected={mark.cluster.geohash === map.selected?.geohash}
            onSelect={map.onSelect}
          />
        ))}
      </Animated.View>
    </GestureDetector>
  );
}

export function ClusterMap(props: ClusterMapProps): ReactNode {
  const { ref, frame, onLayout } = useMapFrame();
  return (
    <View
      ref={ref}
      collapsable={false}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        if (width > 0 && height > 0) props.onFrame({ width, height });
        onLayout(event);
      }}
      className={cn('overflow-hidden bg-surface-1', props.className)}
    >
      {frame === null ? null : <Layers map={props} frame={frame} />}
      {frame === null ? null : <SelectedCard map={props} frame={frame} />}
      <ZoomButtons map={props} />
      <View pointerEvents="none" className="absolute bottom-2 left-3">
        <Text variant="caption" tone="variant">
          {props.attribution}
        </Text>
      </View>
    </View>
  );
}
