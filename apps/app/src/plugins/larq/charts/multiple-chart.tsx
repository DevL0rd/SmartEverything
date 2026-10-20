import { scaleLinear } from 'd3-scale';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import { Badge } from '../../../components/badge';
import { Text } from '../../../components/text';
import { useColour } from '../../../design/colour';
import { WATER_COLOUR } from '../model/bottle-colours';
import type { Multiple } from '../model/stats-model';
import { ChartBox } from './chart-box';

const HEIGHT = 56;
const PAD = 4;

function Plot({
  multiple,
  width,
}: {
  readonly multiple: Multiple;
  readonly width: number;
}): ReactNode {
  const water = useColour(WATER_COLOUR);
  const average = useColour('on-surface-variant');
  const high = Math.max(...multiple.values, multiple.average, 1);
  const low = Math.min(...multiple.values, multiple.average, 0);
  const x = scaleLinear([0, Math.max(1, multiple.values.length - 1)], [PAD, width - PAD]);
  const y = scaleLinear([low, high], [HEIGHT - PAD, PAD]);
  const path = multiple.values
    .map((value, index) => `${index === 0 ? 'M' : 'L'}${String(x(index))} ${String(y(value))}`)
    .join(' ');
  return (
    <Svg width={width} height={HEIGHT}>
      <Line
        x1={PAD}
        x2={width - PAD}
        y1={y(multiple.average)}
        y2={y(multiple.average)}
        stroke={average}
        strokeWidth={1}
        strokeDasharray="3 3"
      />
      <Path d={path} fill="none" stroke={water} strokeWidth={2} strokeLinejoin="round" />
    </Svg>
  );
}

function averageText(multiple: Multiple): string {
  return `${String(Math.round(multiple.average * 10) / 10)} ${multiple.unit}`;
}

export function MultipleChart({ multiple }: { readonly multiple: Multiple }): ReactNode {
  const label = `${multiple.title}, last 30 days: from ${multiple.low} to ${multiple.high}, average ${averageText(multiple)}, ${multiple.delta.text} against the 30 days before.`;
  return (
    <View className="gap-1">
      <View className="flex-row items-center justify-between gap-2">
        <Text variant="label">{multiple.title}</Text>
        <Badge label={multiple.delta.text} tone={multiple.delta.tone} />
      </View>
      <ChartBox label={label} height={HEIGHT}>
        {(width) => <Plot multiple={multiple} width={width} />}
      </ChartBox>
      <View className="flex-row justify-between">
        <Text variant="caption" tone="faint">{`low ${multiple.low}`}</Text>
        <Text variant="caption" tone="faint">{`average ${averageText(multiple)}`}</Text>
        <Text variant="caption" tone="faint">{`high ${multiple.high}`}</Text>
      </View>
    </View>
  );
}
