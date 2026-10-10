import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import { useColour } from '../../design/colour';
import type { ColourRole } from '../../design/tokens';
import { decimal } from '../../format/number';
import { Text } from '../text';
import { thinned } from './scale';

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
const LABEL_GAP = 40;

interface Placed {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly opacity: number;
}

function placeBars(props: BarsProps, width: number, height: number): Placed[] {
  const { bars, highlightKey } = props;
  const max = Math.max(0, ...bars.map((bar) => bar.value));
  const slot = width / Math.max(1, bars.length);
  const barWidth = Math.max(1, slot * (1 - GAP_SHARE));
  return bars.map((bar, index) => {
    const barHeight = max === 0 ? 0 : (Math.max(0, bar.value) / max) * height;
    return {
      key: bar.key,
      x: index * slot + (slot - barWidth) / 2,
      y: height - barHeight,
      width: barWidth,
      height: barHeight,
      opacity: highlightKey === undefined || highlightKey === bar.key ? 1 : DIMMED,
    };
  });
}

function barPath(bar: Placed): string {
  const r = Math.min(RADIUS, bar.width / 2, bar.height);
  const right = bar.x + bar.width;
  const bottom = bar.y + bar.height;
  return [
    `M${String(bar.x)} ${String(bottom)}`,
    `V${String(bar.y + r)}`,
    `Q${String(bar.x)} ${String(bar.y)} ${String(bar.x + r)} ${String(bar.y)}`,
    `H${String(right - r)}`,
    `Q${String(right)} ${String(bar.y)} ${String(right)} ${String(bar.y + r)}`,
    `V${String(bottom)}`,
    'Z',
  ].join(' ');
}

function BarLabels({
  bars,
  width,
}: {
  readonly bars: readonly Bar[];
  readonly width: number;
}): ReactNode {
  const shown = new Set(thinned(bars, width, LABEL_GAP).map((bar) => bar.key));
  return (
    <View className="flex-row">
      {bars.map((bar) => (
        <View key={bar.key} className="flex-1 items-center">
          {shown.has(bar.key) && bar.label !== undefined ? (
            <Text variant="caption" tone="faint" numberOfLines={1} className="tabular">
              {bar.label}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

export function Bars(props: BarsProps): ReactNode {
  const {
    bars,
    colour,
    label,
    height = 120,
    formatValue = (value: number): string => decimal(value),
  } = props;
  const [width, setWidth] = useState(0);
  const fill = useColour(colour);
  const baseline = useColour('outline');
  const box = { height };
  const max = Math.max(0, ...bars.map((bar) => bar.value));
  const hasLabels = bars.some((bar) => bar.label !== undefined);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} className="gap-1">
      <Text variant="caption" tone="faint" className="tabular">
        {formatValue(max)}
      </Text>
      <View
        style={box}
        onLayout={(event) => {
          setWidth(event.nativeEvent.layout.width);
        }}
      >
        {width > 0 ? (
          <Svg width={width} height={height}>
            {placeBars(props, width, height).map((bar) =>
              bar.height > 0 ? (
                <Path key={bar.key} d={barPath(bar)} fill={fill} fillOpacity={bar.opacity} />
              ) : null,
            )}
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
}
