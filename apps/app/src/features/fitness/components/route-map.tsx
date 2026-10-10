import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useColour } from '../../../design/colour';
import { routeDrawing, type RoutePoint } from '../model/workouts';

const SIZE = 240;
const MARGIN = 12;

export function RouteMap({ points }: { readonly points: readonly RoutePoint[] }): ReactNode {
  const line = useColour('primary');
  const start = useColour('positive');
  const drawing = routeDrawing(points, SIZE);
  if (drawing === null) {
    return null;
  }
  const box = `${String(-MARGIN)} ${String(-MARGIN)} ${String(drawing.width + MARGIN * 2)} ${String(drawing.height + MARGIN * 2)}`;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Route"
      className="aspect-square w-full max-w-80 self-center rounded-lg bg-surface-2 p-2"
    >
      <Svg width="100%" height="100%" viewBox={box}>
        <Path
          d={drawing.path}
          fill="none"
          stroke={line}
          strokeWidth={3}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <Path
          d={`M${drawing.start.x.toFixed(1)} ${drawing.start.y.toFixed(1)}h0.01`}
          stroke={start}
          strokeWidth={10}
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}
