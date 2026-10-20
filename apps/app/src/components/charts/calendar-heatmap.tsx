import { useId, type ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Defs, Line, Path, Pattern } from 'react-native-svg';
import { useColour } from '../../design/colour';
import { useMeasuredWidth } from '../use-measured-width';
import { AxisLabel } from './axis-label';
import {
  calendarBlocks,
  calendarCells,
  heatSummary,
  type CalendarBlock,
  type CalendarCell,
  type HeatDay,
} from './heatmap-model';

export interface CalendarHeatmapProps {
  readonly days: readonly HeatDay[];
  readonly today: string;
  readonly label: string;
  readonly split?: number;
}

const GAP = 3;
const LABEL_HEIGHT = 14;
const MIN_CELL = 7;
const MAX_CELL = 14;
const LEVELS = [0, 1, 2, 3, 4] as const;
const LEVEL_OPACITY: Readonly<Record<number, number>> = { 0: 0.5, 1: 0.3, 2: 0.5, 3: 0.75, 4: 1 };

function cellSizeOf(width: number, columns: number): number {
  const fit = Math.floor((width - (columns - 1) * GAP) / columns);
  return Math.max(MIN_CELL, Math.min(MAX_CELL, fit));
}

function pathOf(cells: readonly CalendarCell[], size: number): string {
  const step = size + GAP;
  return cells
    .map((cell) => {
      const x = String(cell.column * step);
      const y = String(LABEL_HEIGHT + cell.row * step);
      return `M${x} ${y}h${String(size)}v${String(size)}h-${String(size)}Z`;
    })
    .join('');
}

function Cells({
  block,
  size,
  hatch,
}: {
  readonly block: CalendarBlock;
  readonly size: number;
  readonly hatch: string;
}): ReactNode {
  const primary = useColour('primary');
  const quiet = useColour('outline-variant');
  const today = useColour('on-surface');
  return (
    <>
      {LEVELS.map((level) => (
        <Path
          key={level}
          d={pathOf(
            block.cells.filter((cell) => cell.level === level && cell.covered),
            size,
          )}
          fill={level === 0 ? quiet : primary}
          fillOpacity={LEVEL_OPACITY[level] ?? 1}
        />
      ))}
      <Path
        d={pathOf(
          block.cells.filter((cell) => !cell.covered),
          size,
        )}
        fill={`url(#${hatch})`}
      />
      <Path
        d={pathOf(
          block.cells.filter((cell) => cell.today),
          size,
        )}
        fill="none"
        stroke={today}
        strokeWidth={1.5}
      />
    </>
  );
}

function BlockView({
  block,
  width,
  hatch,
}: {
  readonly block: CalendarBlock;
  readonly width: number;
  readonly hatch: string;
}): ReactNode {
  const size = cellSizeOf(width, block.columns);
  const step = size + GAP;
  const faint = useColour('on-surface-faint');
  return (
    <View className="relative">
      <Svg width={block.columns * step - GAP} height={LABEL_HEIGHT + 7 * step - GAP}>
        <Defs>
          <Pattern
            id={hatch}
            width={4}
            height={4}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <Line x1={0} y1={0} x2={0} y2={4} stroke={faint} strokeWidth={1.2} />
          </Pattern>
        </Defs>
        <Cells block={block} size={size} hatch={hatch} />
      </Svg>
      {block.labels.map((entry) => (
        <AxisLabel
          key={`${entry.text}-${String(entry.column)}`}
          left={entry.column * step}
          top={0}
          text={entry.text}
        />
      ))}
    </View>
  );
}

export function CalendarHeatmap({
  days,
  today,
  label,
  split = 1,
}: CalendarHeatmapProps): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const hatch = `heat${useId().replace(/[^a-zA-Z0-9]/gu, '')}`;
  const blocks = calendarBlocks(calendarCells(days, today), split);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${label}: ${heatSummary(days)}`}
      onLayout={onLayout}
      className="gap-2"
    >
      {width > 0
        ? blocks.map((block, index) => (
            <BlockView key={index} block={block} width={width} hatch={`${hatch}${String(index)}`} />
          ))
        : null}
    </View>
  );
}
