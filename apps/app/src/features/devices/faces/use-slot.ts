import { useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';

export interface Slot {
  readonly width: number;
  readonly height: number;
}

const EMPTY_SLOT: Slot = { width: 0, height: 0 };

export function useSlot(): {
  readonly slot: Slot;
  readonly onLayout: (event: LayoutChangeEvent) => void;
} {
  const [slot, setSlot] = useState(EMPTY_SLOT);
  const onLayout = (event: LayoutChangeEvent): void => {
    const width = Math.floor(event.nativeEvent.layout.width);
    const height = Math.floor(event.nativeEvent.layout.height);
    setSlot((previous) =>
      previous.width === width && previous.height === height ? previous : { width, height },
    );
  };
  return { slot, onLayout };
}
