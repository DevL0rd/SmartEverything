import { useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';

export interface MeasuredWidth {
  readonly width: number;
  readonly onLayout: (event: LayoutChangeEvent) => void;
}

const exact = (width: number): number => width;

export function useMeasuredWidth(
  snap: (width: number) => number = exact,
  initial = 0,
): MeasuredWidth {
  const [width, setWidth] = useState(initial);
  return {
    width,
    onLayout: (event): void => {
      setWidth(snap(event.nativeEvent.layout.width));
    },
  };
}
