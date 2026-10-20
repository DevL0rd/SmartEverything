import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useColour } from '../../design/colour';
import type { ColourRole } from '../../design/tokens';
import { Text } from '../text';
import { donutArcs, donutSummary, type DonutArc, type DonutSlice } from './donut-model';
import { arcPath } from './geometry';

export interface DonutProps {
  readonly slices: readonly DonutSlice[];
  readonly size: number;
  readonly thickness?: number;
  readonly label: string;
  readonly legend?: boolean;
  readonly children?: ReactNode;
}

const DEFAULT_THICKNESS = 14;

function Segment({
  arc,
  centre,
  radius,
  thickness,
}: {
  readonly arc: DonutArc;
  readonly centre: number;
  readonly radius: number;
  readonly thickness: number;
}): ReactNode {
  const stroke = useColour(arc.colour);
  return (
    <Path
      d={arcPath({ cx: centre, cy: centre, r: radius }, arc.from, arc.to)}
      fill="none"
      stroke={stroke}
      strokeWidth={thickness}
      strokeLinecap="butt"
    />
  );
}

function Swatch({ colour }: { readonly colour: ColourRole }): ReactNode {
  const fill = { backgroundColor: useColour(colour) };
  return <View className="size-2.5 rounded-sm" style={fill} />;
}

export function DonutLegend({ arcs }: { readonly arcs: readonly DonutArc[] }): ReactNode {
  return (
    <View className="gap-1">
      {arcs.map((arc) => (
        <View key={arc.key} className="flex-row items-center gap-2">
          <Swatch colour={arc.colour} />
          <Text variant="caption" tone="variant" className="tabular">
            {arc.label} {Math.round(arc.share * 100)}%
          </Text>
        </View>
      ))}
    </View>
  );
}

export function Donut({
  slices,
  size,
  thickness = DEFAULT_THICKNESS,
  label,
  legend = true,
  children,
}: DonutProps): ReactNode {
  const arcs = donutArcs(slices);
  const centre = size / 2;
  const radius = centre - thickness / 2;
  const track = useColour('outline-variant');
  const box = { width: size, height: size };
  return (
    <View className="flex-row items-center gap-4">
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={`${label}: ${donutSummary(arcs)}`}
        className="items-center justify-center"
        style={box}
      >
        <Svg width={size} height={size}>
          <Path
            d={arcPath({ cx: centre, cy: centre, r: radius }, 0, 360)}
            fill="none"
            stroke={track}
            strokeOpacity={0.5}
            strokeWidth={thickness}
          />
          {arcs.map((arc) => (
            <Segment
              key={arc.key}
              arc={arc}
              centre={centre}
              radius={radius}
              thickness={thickness}
            />
          ))}
        </Svg>
        <View className="absolute items-center">{children}</View>
      </View>
      {legend ? <DonutLegend arcs={arcs} /> : null}
    </View>
  );
}
