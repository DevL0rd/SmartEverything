import { max } from 'd3-array';
import { scaleLinear } from 'd3-scale';
import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { useColour } from '../../design/colour';
import type { ColourRole } from '../../design/tokens';
import { decimal } from '../../format/number';
import { useMeasuredWidth } from '../use-measured-width';
import { Text } from '../text';
import { BarLabels, BarMarks, type BarShape } from './bar-marks';
import { barSlots } from './bar-path';

export interface Bar {
  readonly key: string;
  readonly value: number;
  readonly label?: string;
}

export interface BarsProps {
  readonly bars: readonly Bar[];
  readonly colour: ColourRole;
  readonly label: string;
  readonly height?: number;
  readonly highlightKey?: string;
  readonly formatValue?: (value: number) => string;
}

const GAP_SHARE = 0.25;
const RADIUS = 3;
const DIMMED = 0.4;

const plain = (value: number): string => decimal(value);

function shapesOf(
  bars: readonly Bar[],
  highlightKey: string | undefined,
  {
    width,
    height,
    peak,
  }: { readonly width: number; readonly height: number; readonly peak: number },
): BarShape[] {
  const slots = barSlots(bars.length, width, { gap: GAP_SHARE, min: 1 });
  const y = scaleLinear([0, peak === 0 ? 1 : peak], [height, 0]);
  return bars.flatMap((bar, index): BarShape[] => {
    const slot = slots[index];
    const top = y(Math.max(0, bar.value));
    if (slot === undefined || top >= height) {
      return [];
    }
    return [
      {
        key: bar.key,
        x: slot.x,
        width: slot.width,
        top,
        bottom: height,
        radii: { top: RADIUS, bottom: 0 },
        opacity: highlightKey === undefined || highlightKey === bar.key ? 1 : DIMMED,
      },
    ];
  });
}

export const Bars = memo(function Bars({
  bars,
  colour,
  label,
  height = 120,
  highlightKey,
  formatValue = plain,
}: BarsProps): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const fill = useColour(colour);
  const baseline = useColour('outline');
  const box = { height };
  const peak = Math.max(0, max(bars, (bar) => bar.value) ?? 0);
  const hasLabels = bars.some((bar) => bar.label !== undefined);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} className="gap-1">
      <Text variant="caption" tone="faint" className="tabular">
        {formatValue(peak)}
      </Text>
      <View style={box} onLayout={onLayout}>
        {width > 0 ? (
          <Svg width={width} height={height}>
            <BarMarks shapes={shapesOf(bars, highlightKey, { width, height, peak })} fill={fill} />
            <Line
              x1={0}
              x2={width}
              y1={height - 0.5}
              y2={height - 0.5}
              stroke={baseline}
              strokeWidth={1}
            />
          </Svg>
        ) : null}
      </View>
      {hasLabels ? <BarLabels bars={bars} width={width} /> : null}
    </View>
  );
});
