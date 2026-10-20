import type { BottleStats } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import Svg, { Path } from 'react-native-svg';
import { useColour } from '../../../design/colour';
import { rounded } from '../../../features/device-visuals';
import { PACE_COLOUR, WATER_COLOUR } from '../model/bottle-colours';
import { sizeBins } from '../model/stats-model';
import { ChartBox } from './chart-box';
import { ChartLabel } from './chart-label';

const HEIGHT = 110;
const LABEL_BAND = 20;

function Plot({
  sizes,
  width,
}: {
  readonly sizes: BottleStats['sizes'];
  readonly width: number;
}): ReactNode {
  const water = useColour(WATER_COLOUR);
  const median = useColour(PACE_COLOUR);
  const bins = sizeBins(sizes);
  const slot = width / bins.length;
  const peak = Math.max(1, ...bins.map((bin) => bin.count));
  return (
    <>
      <Svg width={width} height={HEIGHT}>
        {bins.map((bin, index) => {
          const height = ((HEIGHT - LABEL_BAND - 4) * bin.count) / peak;
          return (
            <Path
              key={index}
              d={rounded({
                x: index * slot + 1,
                y: HEIGHT - LABEL_BAND - height,
                w: Math.max(1, slot - 2),
                h: Math.max(bin.count > 0 ? 2 : 0, height),
                r: 2,
              })}
              fill={bin.median ? median : water}
            />
          );
        })}
      </Svg>
      {bins.map((bin, index) => (
        <ChartLabel
          key={`l${String(index)}`}
          left={index * slot - 6}
          top={HEIGHT - LABEL_BAND + 2}
          width={slot + 12}
          text={bin.label}
          align="center"
          tone="variant"
        />
      ))}
    </>
  );
}

export function Histogram({ sizes }: { readonly sizes: BottleStats['sizes'] }): ReactNode {
  const label =
    sizes.medianMl === null
      ? 'No drinks in this period.'
      : `Drink sizes in millilitres, median ${String(Math.round(sizes.medianMl))}, ${String(sizes.count)} drinks.`;
  return (
    <ChartBox label={label} height={HEIGHT}>
      {(width) => <Plot sizes={sizes} width={width} />}
    </ChartBox>
  );
}
