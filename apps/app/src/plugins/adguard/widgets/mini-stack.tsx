import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg from 'react-native-svg';
import { BarMarks } from '../../../components/charts/bar-marks';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { useColour } from '../../../design/colour';
import type { HourBar } from '../model/chart-model';
import { stackShapes } from '../model/stack-shapes';

export function MiniStack({
  bars,
  height,
}: {
  readonly bars: readonly HourBar[];
  readonly height: number;
}): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const colours = { allowed: useColour('viz-1'), blocked: useColour('viz-3') };
  const ceiling = Math.max(1, ...bars.map((bar) => bar.total));
  const box = { height };
  return (
    <View aria-hidden style={box} className="w-full" onLayout={onLayout}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          <BarMarks
            shapes={stackShapes(bars, { ceiling, width, height, colours, selected: null })}
            fill={colours.allowed}
          />
        </Svg>
      ) : null}
    </View>
  );
}
