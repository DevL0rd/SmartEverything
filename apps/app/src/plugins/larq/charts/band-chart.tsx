import type { BottleDaily } from '@smarteverything/domain';
import { scaleLinear } from 'd3-scale';
import type { ReactNode } from 'react';
import Svg, { Path } from 'react-native-svg';
import { useColour } from '../../../design/colour';
import { rounded } from '../../../features/device-visuals';
import { clockOfMinutes } from '../../../format/time';
import { WATER_COLOUR } from '../model/bottle-colours';
import { bandOf } from '../model/stats-model';
import { ChartBox } from './chart-box';
import { ChartLabel } from './chart-label';

const HEIGHT = 96;
const LABEL_BAND = 20;
const DEFAULT_FROM = 360;
const DEFAULT_TO = 1320;

function Plot({
  daily,
  width,
}: {
  readonly daily: readonly BottleDaily[];
  readonly width: number;
}): ReactNode {
  const water = useColour(WATER_COLOUR);
  const band = bandOf(daily);
  const lowest = Math.min(...band.map((entry) => entry.from), DEFAULT_FROM);
  const highest = Math.max(...band.map((entry) => entry.to), DEFAULT_TO);
  const y = scaleLinear([lowest, highest], [4, HEIGHT - LABEL_BAND - 4]);
  const slot = width / Math.max(1, daily.length);
  return (
    <>
      <Svg width={width} height={HEIGHT}>
        {daily.map((entry, index) => {
          const found = band.find((item) => item.day === entry.day);
          return found === undefined ? null : (
            <Path
              key={entry.day}
              d={rounded({
                x: index * slot + 1,
                y: y(found.from),
                w: Math.max(1, slot - 2),
                h: Math.max(2, y(found.to) - y(found.from)),
                r: 2,
              })}
              fill={water}
              fillOpacity={0.85}
            />
          );
        })}
      </Svg>
      <ChartLabel
        left={0}
        top={HEIGHT - LABEL_BAND + 2}
        width={width}
        text={`earliest ${clockOfMinutes(Math.min(...band.map((entry) => entry.from), highest))}, latest ${clockOfMinutes(Math.max(...band.map((entry) => entry.to), lowest))}`}
        tone="variant"
      />
    </>
  );
}

export function BandChart({ daily }: { readonly daily: readonly BottleDaily[] }): ReactNode {
  return (
    <ChartBox
      label="Time of the first and the last drink each day for the last 30 days."
      height={HEIGHT}
    >
      {(width) => <Plot daily={daily} width={width} />}
    </ChartBox>
  );
}
