import { max } from 'd3-array';
import { scaleLinear } from 'd3-scale';
import { memo, useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { useColour } from '../../design/colour';
import type { ColourRole } from '../../design/tokens';
import { decimal } from '../../format/number';
import { cn } from '../../design/cn';
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
  readonly fit?: boolean;
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

interface Plot {
  readonly width: number;
  readonly height: number;
}

const NO_PLOT: Plot = { width: 0, height: 0 };

function usePlot(): { readonly plot: Plot; readonly onLayout: (event: LayoutChangeEvent) => void } {
  const [plot, setPlot] = useState<Plot>(NO_PLOT);
  return {
    plot,
    onLayout: (event): void => {
      const { width, height } = event.nativeEvent.layout;
      setPlot((last) =>
        last.width === width && last.height === height ? last : { width, height },
      );
    },
  };
}

function plotBoxStyle(fit: boolean, height: number): ViewStyle | undefined {
  return fit ? undefined : { height };
}

function heightOf(fit: boolean, plot: Plot, fixed: number): number {
  return fit ? plot.height : fixed;
}

export const Bars = memo(function Bars({
  bars,
  colour,
  label,
  height: fixed = 120,
  highlightKey,
  formatValue = plain,
  fit = false,
}: BarsProps): ReactNode {
  const { plot, onLayout } = usePlot();
  const fill = useColour(colour);
  const baseline = useColour('outline');
  const { width } = plot;
  const height = heightOf(fit, plot, fixed);
  const peak = Math.max(0, max(bars, (bar) => bar.value) ?? 0);
  const hasLabels = bars.some((bar) => bar.label !== undefined);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      className={cn('gap-1', fit && 'min-h-0 flex-1')}
    >
      <Text variant="caption" tone="variant" className="tabular">
        {formatValue(peak)}
      </Text>
      <View
        style={plotBoxStyle(fit, height)}
        className={cn(fit && 'min-h-0 flex-1')}
        onLayout={onLayout}
      >
        {width > 0 && height > 0 ? (
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
