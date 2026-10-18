import { scaleLinear } from 'd3-scale';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { BarMarks } from '../../../components/charts/bar-marks';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { useColour } from '../../../design/colour';
import { useIdiom } from '../../../design/platform';
import { count } from '../../../format/number';
import { spokenBar, type AxisTick, type HourBar } from './chart-model';
import { stackShapes } from './stack-shapes';

const PHONE_HEIGHT = 150;
const WIDE_HEIGHT = 180;
const TICK_WIDTH = 56;

function YLabels({ ticks }: { readonly ticks: readonly number[] }): ReactNode {
  return (
    <View className="w-10 justify-between pr-2">
      {[...ticks].reverse().map((tick) => (
        <Text key={tick} variant="caption" tone="variant" align="end" className="tabular">
          {count(tick)}
        </Text>
      ))}
    </View>
  );
}

function Grid({
  ticks,
  width,
  height,
}: {
  readonly ticks: readonly number[];
  readonly width: number;
  readonly height: number;
}): ReactNode {
  const stroke = useColour('outline-variant');
  const ceiling = ticks[ticks.length - 1] ?? 1;
  const y = scaleLinear([0, ceiling], [height - 0.5, 0.5]);
  return ticks.map((tick) => (
    <Line key={tick} x1={0} x2={width} y1={y(tick)} y2={y(tick)} stroke={stroke} strokeWidth={1} />
  ));
}

function XLabels({
  ticks,
  count: bars,
  width,
}: {
  readonly ticks: readonly AxisTick[];
  readonly count: number;
  readonly width: number;
}): ReactNode {
  const step = width / Math.max(1, bars);
  return (
    <View className="h-5 pl-10">
      <View className="relative flex-1">
        {ticks.map((tick) => {
          const centre = (tick.index + 0.5) * step;
          const left = Math.min(Math.max(0, centre - TICK_WIDTH / 2), width - TICK_WIDTH);
          const place = { left, width: TICK_WIDTH };
          return (
            <View key={tick.index} className="absolute" style={place}>
              <Text variant="caption" tone="variant" align="center" className="tabular">
                {tick.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export interface StackedBarsProps {
  readonly bars: readonly HourBar[];
  readonly valueTicks: readonly number[];
  readonly axisTicks: readonly AxisTick[];
  readonly selected: number | null;
  readonly onSelect: (index: number) => void;
}

export function StackedBars({
  bars,
  valueTicks,
  axisTicks,
  selected,
  onSelect,
}: StackedBarsProps): ReactNode {
  const height = useIdiom() === 'pointer' ? WIDE_HEIGHT : PHONE_HEIGHT;
  const { width, onLayout } = useMeasuredWidth();
  const colours = { allowed: useColour('viz-1'), blocked: useColour('viz-3') };
  const ceiling = valueTicks[valueTicks.length - 1] ?? 1;
  const frame = { height };
  return (
    <View>
      <View className="flex-row" style={frame}>
        <YLabels ticks={valueTicks} />
        <View className="flex-1" onLayout={onLayout}>
          {width > 0 ? (
            <Svg width={width} height={height}>
              <Grid ticks={valueTicks} width={width} height={height} />
              <BarMarks
                shapes={stackShapes(bars, { ceiling, width, height, colours, selected })}
                fill={colours.allowed}
              />
            </Svg>
          ) : null}
          <View className="absolute inset-0 flex-row">
            {bars.map((bar, index) => (
              <Interactive
                key={bar.key}
                label={spokenBar(bar)}
                role="button"
                selected={selected === index}
                onPress={() => {
                  onSelect(index);
                }}
                className="flex-1"
                layerClassName="rounded-xs"
              >
                <View className="flex-1" />
              </Interactive>
            ))}
          </View>
        </View>
      </View>
      {width > 0 ? <XLabels ticks={axisTicks} count={bars.length} width={width} /> : null}
    </View>
  );
}
