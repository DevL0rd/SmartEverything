import type { BrushLiveFrame } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Rings } from '../../../components/charts';
import { Text } from '../../../components/text';
import { boxStyle } from '../charts/style';
import { clockText } from '../model/brush-model';
import { timerLabel, timerProgress } from '../model/stage-model';

export const DEFAULT_ROUTINE_S = 120;

const CAPTION_FROM_PX = 112;

export function TimerRing({
  frame,
  size,
}: {
  readonly frame: BrushLiveFrame;
  readonly size: number;
}): ReactNode {
  const routine = frame.routineS ?? DEFAULT_ROUTINE_S;
  return (
    <View
      accessible
      accessibilityLabel={`Brushing time ${timerLabel(frame.elapsedS, routine)}`}
      className="items-center justify-center"
      style={boxStyle(size, size)}
    >
      <Rings
        size={size}
        rings={[
          {
            progress: timerProgress(frame.elapsedS, routine),
            colour: 'primary',
            label: timerLabel(frame.elapsedS, routine),
          },
        ]}
      />
      <View className="absolute items-center">
        <Text variant={size >= CAPTION_FROM_PX ? 'title-1' : 'title-3'} className="tabular">
          {clockText(frame.elapsedS)}
        </Text>
        {size >= CAPTION_FROM_PX ? (
          <Text variant="caption" tone="variant" className="tabular">
            of {clockText(routine)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
