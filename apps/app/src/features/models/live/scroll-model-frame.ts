import { use, useEffect, useState } from 'react';
import type { View } from 'react-native';
import {
  measure,
  useAnimatedReaction,
  useSharedValue,
  type AnimatedRef,
  type MeasuredDimensions,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { ScreenScrollContext, type ScreenScroll } from '../../../components/screen-context';
import {
  WidgetMotionFrameContext,
  type WidgetMotionFrame,
} from '../../../components/widget-board/widget-scope';
import { useStableCallback } from '../../../design/use-stable-callback';
import type { LiveRect } from './renderer-core';
import type { ScrollLayer } from './scroll-model-layer';
import {
  localModelRect,
  modelScrollBounds,
  modelWithinViewport,
  type ModelScrollBounds,
} from './scroll-model-position';

interface Placement {
  readonly id: string;
  readonly rect: LiveRect | null;
}

function measureScrollBounds(
  box: MeasuredDimensions | null,
  scroll: ScreenScroll,
  motion: WidgetMotionFrame | null,
): ModelScrollBounds | null {
  'worklet';
  const committedTop = motion === null ? 0 : measure(motion.ref)?.y;
  return committedTop === undefined
    ? null
    : modelScrollBounds(box, measure(scroll.scrollRef), scroll.scrollY.get(), committedTop);
}

export function useScrollModelFrame(
  layer: ScrollLayer,
  positioned: AnimatedRef<View>,
  id: string,
): { readonly visible: boolean; readonly onLayout: () => void } {
  const scroll = use(ScreenScrollContext);
  const motion = use(WidgetMotionFrameContext);
  const { root, layout, fillModel } = layer;
  const scrollLayout = scroll?.layout;
  const offset = scroll?.scrollY;
  const ownLayout = useSharedValue(0);
  const scrollBounds = useSharedValue<ModelScrollBounds | null>(null);
  const [visible, setVisible] = useState(scroll === null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const publish = useStableCallback((sample: Placement): void => {
    if (sample.id === id) setPlacement(sample);
  });
  useAnimatedReaction(
    () => [layout.get(), ownLayout.get(), scrollLayout?.get()],
    () => {
      const box = measure(positioned);
      if (!fillModel) scheduleOnRN(publish, { id, rect: localModelRect(box, measure(root)) });
      if (scroll !== null) {
        scrollBounds.set(measureScrollBounds(box, scroll, motion));
      }
    },
  );
  useAnimatedReaction(
    () =>
      offset === undefined ||
      modelWithinViewport(scrollBounds.get(), offset.get(), motion?.top.get()),
    (next, previous) => {
      if (next !== previous) scheduleOnRN(setVisible, next);
    },
  );
  useEffect(() => {
    if (placement?.id === id) layer.place(id, placement.rect);
  }, [id, layer, placement]);
  useEffect(
    () => (): void => {
      layer.place(id, null);
    },
    [id, layer],
  );
  const onLayout = (): void => {
    ownLayout.set((current) => current + 1);
  };
  return { visible, onLayout };
}
