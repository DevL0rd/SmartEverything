import type { BottleStats } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import Svg, { Path } from 'react-native-svg';
import { useColour } from '../../../design/colour';
import { rounded } from '../../../features/device-visuals';
import { WATER_COLOUR } from '../model/bottle-colours';
import { rhythmRows, rhythmSummary } from '../model/stats-model';
import { ChartBox } from './chart-box';
import { ChartLabel } from './chart-label';

const LEFT = 32;
const TOP = 16;
const GAP = 1.5;
const CELL_HEIGHT = 14;
const HOUR_TICKS = [0, 6, 12, 18] as const;
const HEIGHT = TOP + 7 * (CELL_HEIGHT + GAP);

function Cells({
  rhythm,
  cell,
}: {
  readonly rhythm: BottleStats['rhythm'];
  readonly cell: number;
}): ReactNode {
  const water = useColour(WATER_COLOUR);
  const track = useColour('outline-variant');
  return rhythmRows(rhythm).flatMap((row, rowIndex) =>
    row.shares.map((share, hour) => (
      <Path
        key={`${row.name}-${String(hour)}`}
        d={rounded({
          x: LEFT + hour * cell,
          y: TOP + rowIndex * (CELL_HEIGHT + GAP),
          w: Math.max(1, cell - GAP),
          h: CELL_HEIGHT,
          r: 2,
        })}
        fill={share > 0 ? water : 'none'}
        fillOpacity={share > 0 ? 0.2 + share * 0.8 : 0}
        stroke={share > 0 ? water : track}
        strokeWidth={1}
      />
    )),
  );
}

function Plot({
  rhythm,
  width,
}: {
  readonly rhythm: BottleStats['rhythm'];
  readonly width: number;
}): ReactNode {
  const cell = (width - LEFT) / 24;
  return (
    <>
      <Svg width={width} height={HEIGHT}>
        <Cells rhythm={rhythm} cell={cell} />
      </Svg>
      {HOUR_TICKS.map((hour) => (
        <ChartLabel
          key={hour}
          left={LEFT + hour * cell}
          top={0}
          width={28}
          text={String(hour).padStart(2, '0')}
          tone="variant"
        />
      ))}
      {rhythmRows(rhythm).map((row, rowIndex) => (
        <ChartLabel
          key={row.name}
          left={0}
          top={TOP + rowIndex * (CELL_HEIGHT + GAP) - 2}
          width={LEFT - 4}
          text={row.name}
          tone="variant"
        />
      ))}
    </>
  );
}

export function RhythmGrid({ rhythm }: { readonly rhythm: BottleStats['rhythm'] }): ReactNode {
  return (
    <ChartBox label={rhythmSummary(rhythm)} height={HEIGHT}>
      {(width) => <Plot rhythm={rhythm} width={width} />}
    </ChartBox>
  );
}
