import type { BottleStats } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { G, Path } from 'react-native-svg';
import { useColour } from '../../../design/colour';
import { rounded } from '../../../features/device-visuals';
import { WATER_COLOUR } from '../model/bottle-colours';
import { dayAtPoint, type HeatLayout, type StreakMark } from '../model/calendar-model';
import { heatGrid, heatSummary, type HeatCell, type HeatLevel } from '../model/stats-model';
import { ChartBox } from './chart-box';
import { ScaleKey } from './chart-key';
import { ChartLabel } from './chart-label';

const ROWS = 7;
const LABEL_BAND = 16;
const KEY_BAND = 22;
const GAP = 2;
const MIN_LABEL_GAP_PX = 28;
const OPACITY: Readonly<Record<HeatLevel, number>> = { 0: 0, 1: 0.4, 2: 0.6, 3: 0.8, 4: 1 };
const FLAME =
  'M5 0.6C5.4 2.4 8.4 3.8 8.4 6.6A3.4 3.4 0 0 1 1.6 6.6C1.6 5.4 2.2 4.6 2.9 4C3 5 3.5 5.4 4 5.4C4 3.6 4.6 2.2 5 0.6Z';
const FLAME_BOX = 10;
const MAX_CELL = 22;
const MAX_STRETCH = 2;

interface HeatmapProps {
  readonly heatmap: BottleStats['heatmap'];
  readonly today: string;
  readonly streak?: StreakMark;
  readonly onSelect?: (day: string) => void;
  readonly maxHeight?: number;
  readonly keyed?: boolean;
}

interface Corner {
  readonly x: number;
  readonly y: number;
}

function Flame({ cell, at }: { readonly cell: number; readonly at: Corner }): ReactNode {
  const warning = useColour('warning');
  return (
    <G transform={`translate(${String(at.x)} ${String(at.y)}) scale(${String(cell / FLAME_BOX)})`}>
      <Path d={FLAME} fill={warning} />
    </G>
  );
}

function Cells({
  cells,
  geometry,
  today,
  streak,
}: {
  readonly cells: readonly HeatCell[];
  readonly geometry: { readonly step: number; readonly cell: number; readonly across: number };
  readonly today: string;
  readonly streak: StreakMark | undefined;
}): ReactNode {
  const water = useColour(WATER_COLOUR);
  const track = useColour('outline-variant');
  const ring = useColour('on-surface');
  const warning = useColour('warning');
  const { step, cell, across } = geometry;
  const corner = (entry: HeatCell): Corner => ({
    x: entry.week * step,
    y: LABEL_BAND + entry.row * (cell + GAP),
  });
  return (
    <>
      {cells.map((entry) => {
        const streaked = streak?.days.has(entry.day) === true;
        return (
          <Path
            key={entry.day}
            d={rounded({ ...corner(entry), w: across, h: cell, r: 2 })}
            fill={entry.level === 0 ? 'none' : water}
            fillOpacity={OPACITY[entry.level]}
            stroke={
              entry.day === today ? ring : streaked ? warning : entry.level === 0 ? track : water
            }
            strokeWidth={entry.day === today || streaked ? 2 : 1}
          />
        );
      })}
      {cells
        .filter((entry) => entry.day === streak?.end)
        .map((entry) => (
          <Flame key={entry.day} cell={cell} at={corner(entry)} />
        ))}
    </>
  );
}

function cellOf(heatmap: HeatmapProps['heatmap'], width: number): number {
  const weeks = Math.ceil(heatmap.length / ROWS) + 1;
  return Math.max(4, (width - GAP * (weeks - 1)) / weeks);
}

interface Shape {
  readonly days: HeatmapProps['heatmap'];
  readonly cell: number;
  readonly dense: boolean;
}

function shapeOf(
  heatmap: HeatmapProps['heatmap'],
  width: number,
  maxHeight: number | undefined,
  keyed: boolean,
): Shape {
  if (maxHeight === undefined) {
    return { days: heatmap, cell: cellOf(heatmap, width), dense: false };
  }
  const cap = Math.min(
    MAX_CELL,
    Math.max(4, (maxHeight - LABEL_BAND - (keyed ? KEY_BAND : 0)) / ROWS - GAP),
  );
  const weeks = Math.max(2, Math.floor((width + GAP) / (cap + GAP)));
  const keep = (weeks - 1) * ROWS;
  const days = heatmap.length > keep ? heatmap.slice(-keep) : heatmap;
  return { days, cell: Math.min(cellOf(days, width), cap), dense: true };
}

function stepOf(input: {
  readonly dense: boolean;
  readonly cell: number;
  readonly width: number;
  readonly weeks: number;
}): number {
  const { dense, cell, width, weeks } = input;
  return dense
    ? Math.min(Math.max(cell + GAP, width / weeks), (cell + GAP) * MAX_STRETCH)
    : (width - cell) / Math.max(1, weeks - 1);
}

function dayTap(
  cells: readonly HeatCell[],
  layout: HeatLayout,
  onSelect: HeatmapProps['onSelect'],
): ReturnType<typeof Gesture.Tap> {
  return Gesture.Tap()
    .runOnJS(true)
    .onEnd((event, success) => {
      const day = success ? dayAtPoint(cells, layout, event) : null;
      if (day !== null) {
        onSelect?.(day);
      }
    });
}

function Plot({ width, ...props }: HeatmapProps & { readonly width: number }): ReactNode {
  const { onSelect } = props;
  const { days, cell, dense } = shapeOf(
    props.heatmap,
    width,
    props.maxHeight,
    props.keyed !== false,
  );
  const grid = heatGrid(days, Math.ceil(MIN_LABEL_GAP_PX / (cell + GAP)));
  const step = stepOf({ dense, cell, width, weeks: grid.weeks });
  const across = dense ? step - GAP : cell;
  const used = (grid.weeks - 1) * step + across;
  const offset = { marginLeft: Math.max(0, width - used) };
  const layout: HeatLayout = { step, top: LABEL_BAND, rowStep: cell + GAP };
  const tap = dayTap(grid.cells, layout, onSelect);
  const drawing = (
    <Svg width={used} height={LABEL_BAND + ROWS * (cell + GAP)}>
      <Cells
        cells={grid.cells}
        geometry={{ step, cell, across }}
        today={props.today}
        streak={props.streak}
      />
    </Svg>
  );
  return (
    <View style={offset}>
      {onSelect === undefined ? (
        drawing
      ) : (
        <GestureDetector gesture={tap}>
          <View collapsable={false}>{drawing}</View>
        </GestureDetector>
      )}
      {grid.months.map((month) => (
        <ChartLabel
          key={`${String(month.week)}-${month.label}`}
          left={month.week * step}
          top={0}
          width={36}
          text={month.label}
          tone="variant"
        />
      ))}
    </View>
  );
}

export function HeatKey(): ReactNode {
  return <ScaleKey colour={WATER_COLOUR} opacities={[0.4, 0.6, 0.8, 1]} />;
}

export function Heatmap(props: HeatmapProps): ReactNode {
  return (
    <View className="gap-1">
      <ChartBox
        label={heatSummary(props.heatmap)}
        height={(width) =>
          LABEL_BAND +
          ROWS * (shapeOf(props.heatmap, width, props.maxHeight, props.keyed !== false).cell + GAP)
        }
      >
        {(width) => <Plot {...props} width={width} />}
      </ChartBox>
      {props.keyed === false ? null : <HeatKey />}
    </View>
  );
}
