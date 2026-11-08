import { useRef, useState, type RefObject } from 'react';
import type { LayoutChangeEvent, View } from 'react-native';
import { useVisibleLive } from '../../../design/use-visible-live';
import type { FrameSize } from './projection';

export interface MapFrame {
  readonly ref: RefObject<View | null>;
  readonly frame: FrameSize | null;
  readonly onLayout: (event: LayoutChangeEvent) => void;
}

export function frameOf(width: number, height: number, live: boolean): FrameSize | null {
  return live && width > 0 && height > 0 ? { width, height } : null;
}

export function useMapFrame(): MapFrame {
  const ref = useRef<View>(null);
  const [size, setSize] = useState<FrameSize>({ width: 0, height: 0 });
  const { live, onLayout } = useVisibleLive(ref);
  return {
    ref,
    frame: frameOf(size.width, size.height, live),
    onLayout: (event): void => {
      const { width, height } = event.nativeEvent.layout;
      if (width !== size.width || height !== size.height) {
        setSize({ width, height });
      }
      onLayout?.();
    },
  };
}
