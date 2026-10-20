import type { TreadmillStats } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Text } from '../../../components/text';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { useColour } from '../../../design/colour';
import { heatCells, heatSummary, type HeatCell } from '../model/stats-model';
import { calendarWeeks } from '../model/widget-model';

const CELL = 12;
const GAP = 3;
const STEP = CELL + GAP;
const LEVELS = [0, 1, 2, 3, 4] as const;
const LEVEL_OPACITY: Readonly<Record<number, number>> = { 0: 0.5, 1: 0.3, 2: 0.5, 3: 0.75, 4: 1 };

function pathOf(cells: readonly HeatCell[]): string {
  return cells
    .map(
      (cell) =>
        `M${String(cell.column * STEP)} ${String(cell.row * STEP)}h${String(CELL)}v${String(CELL)}h-${String(CELL)}Z`,
    )
    .join('');
}

function LevelPath({
  level,
  cells,
}: {
  readonly level: number;
  readonly cells: readonly HeatCell[];
}): ReactNode {
  const fill = useColour(level === 0 ? 'outline-variant' : 'primary');
  return <Path d={pathOf(cells)} fill={fill} fillOpacity={LEVEL_OPACITY[level] ?? 1} />;
}

export function HeatMap({
  heatmap,
  today,
}: {
  readonly heatmap: TreadmillStats['heatmap'];
  readonly today: string;
}): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const weeks = calendarWeeks(width);
  const cells = heatCells(heatmap, weeks, today);
  const summary = `Activity calendar, last ${String(weeks)} weeks: ${heatSummary(cells)}`;
  return (
    <View className="gap-2">
      <Text variant="caption" tone="variant">
        Last {weeks} weeks
      </Text>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={summary}
        onLayout={onLayout}
        className="items-end"
      >
        {width > 0 ? (
          <Svg width={weeks * STEP - GAP} height={7 * STEP - GAP}>
            {LEVELS.map((level) => (
              <LevelPath
                key={level}
                level={level}
                cells={cells.filter((cell) => cell.level === level)}
              />
            ))}
          </Svg>
        ) : null}
      </View>
    </View>
  );
}
