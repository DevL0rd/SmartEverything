import { useRef, type ReactNode } from 'react';
import type { View } from 'react-native';
import { useAnimatedRef } from 'react-native-reanimated';
import { NativeModelFace } from './native-model-face';
import { useScrollModelFrame } from './scroll-model-frame';
import type { ScrollLayer } from './scroll-model-layer';
import { useLiveView, type LiveModelViewProps } from './use-live-view';

export function ScrollModelView(
  props: LiveModelViewProps & { readonly layer: ScrollLayer },
): ReactNode {
  const { id, layer, px, still } = props;
  const frame = useRef<View>(null);
  const positioned = useAnimatedRef<View>();
  const position = useScrollModelFrame(layer, positioned, id);
  const { live, drawn, onLayout } = useLiveView(props, frame, layer.surface, position.visible);
  const layoutChanged = (): void => {
    onLayout?.();
    position.onLayout();
  };
  return (
    <NativeModelFace
      frame={frame}
      positioned={positioned}
      onLayout={layoutChanged}
      drawn={live ? drawn : false}
      px={px}
      still={still}
    />
  );
}
