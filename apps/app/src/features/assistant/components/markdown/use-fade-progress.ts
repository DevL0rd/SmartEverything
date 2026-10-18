import { useEffect, useState } from 'react';
import { useSharedValue, withDelay, withTiming, type SharedValue } from 'react-native-reanimated';
import { EASING } from '../../../../design/motion';
import { FADE_MS, elapsedMs, type Batch } from '../../model/stream-fade';

export function useFadeProgress(batch: Batch): SharedValue<number> {
  const [elapsed] = useState(() => elapsedMs(batch, Date.now()));
  const progress = useSharedValue(Math.max(0, Math.min(1, elapsed / FADE_MS)));
  useEffect(() => {
    progress.set(
      withDelay(
        Math.max(0, -elapsed),
        withTiming(1, { duration: FADE_MS - Math.max(0, elapsed), easing: EASING.fade }),
      ),
    );
  }, [progress, elapsed]);
  return progress;
}
