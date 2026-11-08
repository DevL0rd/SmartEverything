import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { useColour } from '../../../design/colour';
import { growthShapeOf, type GrowthDay } from './growth-model';

const HEIGHT = 88;
const STROKE = 2;
const AREA_OPACITY = 0.18;

export function GrowthChart({
  days,
  perMonth,
  label,
}: {
  readonly days: readonly GrowthDay[];
  readonly perMonth: number | null;
  readonly label: string;
}): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const colour = useColour('viz-1');
  const shape = growthShapeOf(days, perMonth, width, HEIGHT - STROKE);
  return (
    <View
      onLayout={onLayout}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      className="h-22"
    >
      {shape === null ? null : (
        <Svg width={width} height={HEIGHT}>
          <Path d={shape.area} fill={colour} fillOpacity={AREA_OPACITY} />
          <Path
            d={shape.line}
            fill="none"
            stroke={colour}
            strokeWidth={STROKE}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {shape.projection === null ? null : (
            <Path
              d={shape.projection}
              fill="none"
              stroke={colour}
              strokeWidth={STROKE}
              strokeDasharray="4 4"
              strokeLinecap="round"
            />
          )}
        </Svg>
      )}
    </View>
  );
}
