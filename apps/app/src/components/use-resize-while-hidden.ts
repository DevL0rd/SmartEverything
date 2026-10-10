import { use, useLayoutEffect, useRef, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { ScreenPausedContext } from '../design/screen-pause';

export function useResizeWhileHidden(): number {
  const paused = use(ScreenPausedContext);
  const { width, height } = useWindowDimensions();
  const size = `${String(width)}x${String(height)}`;
  const hiddenAt = useRef<string | null>(null);
  const [resizes, setResizes] = useState(0);
  useLayoutEffect(() => {
    if (paused) {
      hiddenAt.current ??= size;
      return;
    }
    if (hiddenAt.current !== null && hiddenAt.current !== size) {
      setResizes((count) => count + 1);
    }
    hiddenAt.current = null;
  }, [paused, size]);
  return resizes;
}
