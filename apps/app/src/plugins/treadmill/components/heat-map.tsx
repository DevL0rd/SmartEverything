import type { TreadmillStats } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Text } from '../../../components/text';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { useColour } from '../../../design/colour';
import { heatCells, heatSummary, type HeatCell } from '../model/stats-model';
import {
  CALENDAR_CELL,
  CALENDAR_GRID_HEIGHT,
  CALENDAR_STEP,
  calendarPlotOf,
} from '../model/widget-model';

const LEVELS = [0, 1, 2, 3, 4] as const;
const LEVEL_OPACITY: Readonly<Record<number, number>> = { 0: 0.5, 1: 0.3, 2: 0.5, 3: 0.75, 4: 1 };

function pathOf(cells: readonly HeatCell[]): string {
  return cells
    .map(
      (cell) =>
        `M${String(cell.column * CALENDAR_STEP)} ${String(cell.row * CALENDAR_STEP)}h${String(CALENDAR_CELL)}v${String(CALENDAR_CELL)}h-${String(CALENDAR_CELL)}Z`,
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

interface HeatMapProps {
  readonly heatmap: TreadmillStats['heatmap'];
  readonly today: string;
  readonly plotHeight?: number;
}

export function HeatMap({ heatmap, today, plotHeight }: HeatMapProps): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const plot = calendarPlotOf(width, plotHeight);
  const cells = heatCells(heatmap, plot.weeks, today);
  const summary = `Activity calendar, last ${String(plot.weeks)} weeks: ${heatSummary(cells)}`;
  return (
    <View className={plotHeight === undefined ? 'gap-2' : 'min-w-0 flex-1 gap-1'}>
      <Text variant="caption" tone="variant">
        Last {plot.weeks} weeks
      </Text>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={summary}
        onLayout={onLayout}
        className={plotHeight === undefined ? 'items-end' : 'items-start'}
      >
        {plot.width > 0 && plot.height > 0 ? (
          <Svg
            width={plot.width}
            height={plot.height}
            viewBox={`0 0 ${String(plot.gridWidth)} ${String(CALENDAR_GRID_HEIGHT)}`}
          >
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
