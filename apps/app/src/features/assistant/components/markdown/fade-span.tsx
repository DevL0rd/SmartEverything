import type { ReactNode } from 'react';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import type { Batch } from '../../model/stream-fade';
import { useFadeProgress } from './use-fade-progress';

export function FadeSpan({
  text,
  batch,
}: {
  readonly text: string;
  readonly colour: string;
  readonly batch: Batch;
}): ReactNode {
  const progress = useFadeProgress(batch);
  const style = useAnimatedStyle(() => ({ opacity: progress.get() }));
  return <Animated.Text style={style}>{text}</Animated.Text>;
}
