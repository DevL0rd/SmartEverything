import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Text } from '../../../components/text';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { useColour } from '../../../design/colour';
import type { ColourRole } from '../../../design/tokens';
import { leftStyle, tintStyle } from './style';
import { heatSummary, type HeatCell, type HeatGrid } from '../model/calendar-model';

const CELL = 10;
const GAP = 2.5;
const STEP = CELL + GAP;

const KINDS: readonly {
  readonly kind: HeatCell['kind'];
  readonly colour: ColourRole;
  readonly opacity: number;
  readonly label: string;
}[] = [
  { kind: 'none', colour: 'outline-variant', opacity: 0.6, label: 'No brushing' },
  { kind: 'short', colour: 'warning', opacity: 1, label: 'Stopped early' },
  { kind: 'one', colour: 'positive', opacity: 0.45, label: 'One full brush' },
  { kind: 'goal', colour: 'positive', opacity: 1, label: 'Goal met' },
];

function cellsPath(cells: readonly HeatCell[]): string {
  return cells
    .map(
      (cell) =>
        `M${String(cell.column * STEP)} ${String(cell.row * STEP)}h${String(CELL)}v${String(CELL)}h-${String(CELL)}Z`,
    )
    .join('');
}

function KindPath({
  cells,
  spec,
}: {
  readonly cells: readonly HeatCell[];
  readonly spec: (typeof KINDS)[number];
}): ReactNode {
  const fill = useColour(spec.colour);
  return <Path d={cellsPath(cells)} fill={fill} fillOpacity={spec.opacity} />;
}

function Swatch({ spec }: { readonly spec: (typeof KINDS)[number] }): ReactNode {
  const fill = useColour(spec.colour);
  return (
    <View className="flex-row items-center gap-1.5">
      <View className="size-2.5 rounded-xs" style={tintStyle(fill, spec.opacity)} />
      <Text variant="caption" tone="variant">
        {spec.label}
      </Text>
    </View>
  );
}

export function YearHeatmap({ grid }: { readonly grid: HeatGrid }): ReactNode {
  const { onLayout } = useMeasuredWidth();
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Brushing calendar, ${heatSummary(grid)}`}
      onLayout={onLayout}
      className="gap-2"
    >
      <View className="relative h-4">
        {grid.months.map((month) => (
          <View
            key={`${month.label}${String(month.column)}`}
            className="absolute"
            style={leftStyle(month.column * STEP)}
          >
            <Text variant="caption" tone="faint">
              {month.label}
            </Text>
          </View>
        ))}
      </View>
      <View className="items-start">
        <Svg width={grid.weeks * STEP - GAP} height={7 * STEP - GAP}>
          {KINDS.map((spec) => (
            <KindPath
              key={spec.kind}
              spec={spec}
              cells={grid.cells.filter((cell) => cell.kind === spec.kind)}
            />
          ))}
        </Svg>
      </View>
      <View className="flex-row flex-wrap gap-x-4 gap-y-1">
        {KINDS.map((spec) => (
          <Swatch key={spec.kind} spec={spec} />
        ))}
      </View>
    </View>
  );
}
