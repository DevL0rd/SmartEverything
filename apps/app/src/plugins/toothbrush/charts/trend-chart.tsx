import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import { Text } from '../../../components/text';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { useColour } from '../../../design/colour';
import { clockText } from '../model/brush-model';
import type { Trend } from '../model/stats-model';
import { trendPath, trendY, type TrendFrame } from '../model/trend-path';
import { boxStyle } from './style';

const TREND_HEIGHT = 120;
const LABEL_WIDTH = 34;
const LABEL_HEIGHT = 16;

function Guides({
  ticks,
  target,
  frame,
}: {
  readonly ticks: readonly number[];
  readonly target: number;
  readonly frame: TrendFrame;
}): ReactNode {
  const grid = useColour('outline-variant');
  const goal = useColour('positive');
  return (
    <>
      {ticks.map((tick) => (
        <Line
          key={tick}
          x1={0}
          x2={frame.width}
          y1={trendY(tick, frame)}
          y2={trendY(tick, frame)}
          stroke={grid}
          strokeWidth={1}
        />
      ))}
      <Line
        x1={0}
        x2={frame.width}
        y1={trendY(target, frame)}
        y2={trendY(target, frame)}
        stroke={goal}
        strokeWidth={1.4}
        strokeDasharray="5 4"
      />
    </>
  );
}

function Plot({
  trend,
  target,
  frame,
}: {
  readonly trend: Trend;
  readonly target: number;
  readonly frame: TrendFrame;
}): ReactNode {
  const line = useColour('primary');
  const ghost = useColour('on-surface-faint');
  return (
    <Svg width={frame.width} height={frame.height}>
      <Guides ticks={trend.ticks} target={target} frame={frame} />
      <Path
        d={trendPath(trend.points, (point) => point.before, frame)}
        fill="none"
        stroke={ghost}
        strokeWidth={1.6}
        strokeDasharray="2 3"
        strokeLinecap="round"
      />
      <Path
        d={trendPath(trend.points, (point) => point.seconds, frame)}
        fill="none"
        stroke={line}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function TrendChart({
  trend,
  target,
  label,
  height = TREND_HEIGHT,
}: {
  readonly trend: Trend;
  readonly target: number;
  readonly label: string;
  readonly height?: number;
}): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const inner = Math.max(0, width - LABEL_WIDTH);
  const frame: TrendFrame = { width: inner, height, min: trend.min, max: trend.max };
  const last = trend.ticks.length - 1;
  const ticks =
    height >= trend.ticks.length * LABEL_HEIGHT
      ? trend.ticks
      : trend.ticks.filter((_, index) => index === 0 || index === last);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} className="gap-1">
      <View className="flex-row" onLayout={onLayout}>
        <View style={boxStyle(LABEL_WIDTH, height)} className="justify-between">
          {[...ticks].reverse().map((tick) => (
            <Text key={tick} variant="caption" tone="variant" className="tabular">
              {clockText(tick)}
            </Text>
          ))}
        </View>
        {inner > 0 ? <Plot trend={trend} target={target} frame={frame} /> : null}
      </View>
      <Text variant="caption" tone="variant">
        Solid line: this period. Dotted line: the period before. Green dashes: the routine target.
      </Text>
    </View>
  );
}
