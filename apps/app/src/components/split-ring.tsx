import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useColour } from '../design/colour';

export interface SplitRingProps {
  readonly colours: readonly string[];
  readonly size: number;
  readonly label: string;
}

const THICKNESS = 3;
const GAP = 5;
const ARCS_MOST = 4;
const QUARTER = 4;

export function SplitRing({ colours, size, label }: SplitRingProps): ReactNode {
  const empty = useColour('outline');
  const arcs = colours.slice(0, ARCS_MOST);
  const radius = (size - THICKNESS) / 2;
  const circumference = 2 * Math.PI * radius;
  const share = circumference / Math.max(1, arcs.length);
  const gap = arcs.length > 1 ? GAP : 0;
  const box: ViewStyle = { width: size, height: size };
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      pointerEvents="none"
      style={box}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${String(size)} ${String(size)}`}>
        {arcs.length === 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={empty}
            strokeWidth={THICKNESS}
          />
        ) : (
          arcs.map((colour, index) => (
            <Circle
              key={`${String(index)}-${colour}`}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={colour}
              strokeWidth={THICKNESS}
              strokeDasharray={`${String(share - gap)} ${String(circumference - share + gap)}`}
              strokeDashoffset={circumference / QUARTER - index * share - gap / 2}
            />
          ))
        )}
      </Svg>
    </View>
  );
}
