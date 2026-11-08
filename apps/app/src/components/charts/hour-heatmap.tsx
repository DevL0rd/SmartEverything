import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useColour } from '../../design/colour';
import { useMeasuredWidth } from '../use-measured-width';
import { AxisLabel } from './axis-label';
import { hourCells, hourSummary, type HeatRow, type HourCell } from './heatmap-model';

export interface HourHeatmapProps {
  readonly matrix: readonly (readonly number[])[];
  readonly rows: readonly HeatRow[];
  readonly unit: string;
  readonly label: string;
}

const GAP = 2;
const LABEL_CHAR = 8;
const LABEL_PAD = 6;
const HOURS = 24;
const MAX_CELL = 18;
const LEVELS = [0, 1, 2, 3, 4] as const;
const LEVEL_OPACITY: Readonly<Record<number, number>> = { 0: 0.5, 1: 0.3, 2: 0.5, 3: 0.75, 4: 1 };
const HOUR_MARKS = [0, 6, 12, 18] as const;
const HEADER = 12;

interface CellBox {
  readonly width: number;
  readonly height: number;
  readonly inset: number;
}

export function labelWidthOf(rows: readonly HeatRow[]): number {
  return Math.max(0, ...rows.map((row) => row.short.length)) * LABEL_CHAR + LABEL_PAD;
}

function pathOf(cells: readonly HourCell[], { width, height, inset }: CellBox): string {
  return cells
    .map((cell) => {
      const x = inset + cell.column * (width + GAP);
      const y = HEADER + cell.row * (height + GAP);
      return `M${String(x)} ${String(y)}h${String(width)}v${String(height)}h-${String(width)}Z`;
    })
    .join('');
}

function Grid({
  cells,
  box,
  rows,
}: {
  readonly cells: readonly HourCell[];
  readonly box: CellBox;
  readonly rows: number;
}): ReactNode {
  const primary = useColour('primary');
  const quiet = useColour('outline-variant');
  return (
    <Svg width={box.inset + HOURS * (box.width + GAP)} height={HEADER + rows * (box.height + GAP)}>
      {LEVELS.map((level) => (
        <Path
          key={level}
          d={pathOf(
            cells.filter((cell) => cell.level === level),
            box,
          )}
          fill={level === 0 ? quiet : primary}
          fillOpacity={LEVEL_OPACITY[level] ?? 1}
        />
      ))}
    </Svg>
  );
}

function Axes({
  box,
  rows,
}: {
  readonly box: CellBox;
  readonly rows: readonly HeatRow[];
}): ReactNode {
  return (
    <>
      {rows.map((row, index) => (
        <AxisLabel
          key={index}
          left={0}
          top={HEADER + index * (box.height + GAP) - 2}
          text={row.short}
        />
      ))}
      {HOUR_MARKS.map((hour) => (
        <AxisLabel
          key={hour}
          left={box.inset + hour * (box.width + GAP)}
          top={-2}
          text={String(hour).padStart(2, '0')}
        />
      ))}
    </>
  );
}

export function HourHeatmap({ matrix, rows, unit, label }: HourHeatmapProps): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const inset = labelWidthOf(rows);
  const cellWidth = Math.max(4, Math.min(MAX_CELL, Math.floor((width - inset) / HOURS) - GAP));
  const box = { width: cellWidth, height: Math.min(cellWidth + 2, 16), inset };
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${label}: ${hourSummary(matrix, rows, unit)}`}
      onLayout={onLayout}
    >
      {width > 0 ? (
        <View className="relative">
          <Grid cells={hourCells(matrix)} box={box} rows={rows.length} />
          <Axes box={box} rows={rows} />
        </View>
      ) : null}
    </View>
  );
}
