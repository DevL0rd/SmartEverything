import { useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { isNative } from '../design/platform';

export interface MeasuredWidth {
  readonly width: number;
  readonly onLayout: (event: LayoutChangeEvent) => void;
}

const exact = (width: number): number => width;

export function useMeasuredWidth(snap: (width: number) => number = exact): MeasuredWidth {
  const [width, setWidth] = useState(0);
  return {
    width,
    onLayout: (event): void => {
      const next = snap(event.nativeEvent.layout.width);
      setWidth((kept) => (next === 0 && !isNative() ? kept : next));
    },
  };
}
