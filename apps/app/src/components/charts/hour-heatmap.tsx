import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useColour } from '../../design/colour';
import { useMeasuredWidth } from '../use-measured-width';
import { AxisLabel } from './axis-label';
import { WEEKDAY_LETTERS, hourCells, hourSummary, type HourCell } from './heatmap-model';

export interface HourHeatmapProps {
  readonly matrix: readonly (readonly number[])[];
  readonly label: string;
}

const GAP = 2;
const LABEL_WIDTH = 14;
const HOURS = 24;
const ROWS = 7;
const MAX_CELL = 18;
const LEVELS = [0, 1, 2, 3, 4] as const;
const LEVEL_OPACITY: Readonly<Record<number, number>> = { 0: 0.5, 1: 0.3, 2: 0.5, 3: 0.75, 4: 1 };
const HOUR_MARKS = [0, 6, 12, 18] as const;
const HEADER = 12;

function pathOf(cells: readonly HourCell[], width: number, height: number): string {
  return cells
    .map((cell) => {
      const x = LABEL_WIDTH + cell.column * (width + GAP);
      const y = HEADER + cell.row * (height + GAP);
      return `M${String(x)} ${String(y)}h${String(width)}v${String(height)}h-${String(width)}Z`;
    })
    .join('');
}

function Grid({
  cells,
  cellWidth,
  cellHeight,
}: {
  readonly cells: readonly HourCell[];
  readonly cellWidth: number;
  readonly cellHeight: number;
}): ReactNode {
  const primary = useColour('primary');
  const quiet = useColour('outline-variant');
  return (
    <Svg
      width={LABEL_WIDTH + HOURS * (cellWidth + GAP)}
      height={HEADER + ROWS * (cellHeight + GAP)}
    >
      {LEVELS.map((level) => (
        <Path
          key={level}
          d={pathOf(
            cells.filter((cell) => cell.level === level),
            cellWidth,
            cellHeight,
          )}
          fill={level === 0 ? quiet : primary}
          fillOpacity={LEVEL_OPACITY[level] ?? 1}
        />
      ))}
    </Svg>
  );
}

function Axes({
  cellWidth,
  cellHeight,
}: {
  readonly cellWidth: number;
  readonly cellHeight: number;
}): ReactNode {
  return (
    <>
      {WEEKDAY_LETTERS.map((letter, index) => (
        <AxisLabel
          key={index}
          left={0}
          top={HEADER + index * (cellHeight + GAP) - 2}
          text={letter}
        />
      ))}
      {HOUR_MARKS.map((hour) => (
        <AxisLabel
          key={hour}
          left={LABEL_WIDTH + hour * (cellWidth + GAP)}
          top={-2}
          text={String(hour).padStart(2, '0')}
        />
      ))}
    </>
  );
}

export function HourHeatmap({ matrix, label }: HourHeatmapProps): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const cellWidth = Math.max(
    4,
    Math.min(MAX_CELL, Math.floor((width - LABEL_WIDTH) / HOURS) - GAP),
  );
  const cellHeight = Math.min(cellWidth + 2, 16);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${label}: ${hourSummary(matrix)}`}
      onLayout={onLayout}
    >
      {width > 0 ? (
        <View className="relative">
          <Grid cells={hourCells(matrix)} cellWidth={cellWidth} cellHeight={cellHeight} />
          <Axes cellWidth={cellWidth} cellHeight={cellHeight} />
        </View>
      ) : null}
    </View>
  );
}
