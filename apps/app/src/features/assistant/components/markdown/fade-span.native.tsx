import type { ReactNode } from 'react';
import Animated, { interpolateColor, useAnimatedStyle } from 'react-native-reanimated';
import { withAlpha } from '../../../../design/colour';
import type { Batch } from '../../model/stream-fade';
import { useFadeProgress } from './use-fade-progress';

export function FadeSpan({
  text,
  colour,
  batch,
}: {
  readonly text: string;
  readonly colour: string;
  readonly batch: Batch;
}): ReactNode {
  const progress = useFadeProgress(batch);
  const clear = withAlpha(colour, 0);
  const solid = withAlpha(colour, 1);
  const style = useAnimatedStyle(() => ({
    color: interpolateColor(progress.get(), [0, 1], [clear, solid]),
  }));
  return <Animated.Text style={style}>{text}</Animated.Text>;
}
