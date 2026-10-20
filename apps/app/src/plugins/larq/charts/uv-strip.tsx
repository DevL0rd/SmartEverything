import type { BottleCareView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import Svg, { Path } from 'react-native-svg';
import { useColour } from '../../../design/colour';
import { rounded } from '../../../features/device-visuals';
import { UV_COLOUR } from '../model/bottle-colours';
import { ChartBox } from './chart-box';

const HEIGHT = 72;
const MODES = ['maintenance', 'normal', 'adventure'] as const;

function Plot({
  days,
  width,
}: {
  readonly days: BottleCareView['uvDays'];
  readonly width: number;
}): ReactNode {
  const colours = {
    normal: useColour(UV_COLOUR.normal),
    adventure: useColour(UV_COLOUR.adventure),
    maintenance: useColour(UV_COLOUR.maintenance),
  };
  const peak = Math.max(1, ...days.map((day) => day.normal + day.adventure + day.maintenance));
  const slot = width / Math.max(1, days.length);
  const unit = (HEIGHT - 4) / peak;
  return (
    <Svg width={width} height={HEIGHT}>
      {days.map((day, index) => {
        let floor = HEIGHT;
        return MODES.map((mode) => {
          const height = day[mode] * unit;
          floor -= height;
          return height <= 0 ? null : (
            <Path
              key={`${day.day}-${mode}`}
              d={rounded({
                x: index * slot + 1,
                y: floor,
                w: Math.max(1, slot - 2),
                h: height,
                r: 1.5,
              })}
              fill={colours[mode]}
            />
          );
        });
      })}
    </Svg>
  );
}

export function UvStrip({ days }: { readonly days: BottleCareView['uvDays'] }): ReactNode {
  const total = days.reduce((sum, day) => sum + day.normal + day.adventure + day.maintenance, 0);
  return (
    <ChartBox
      label={`${String(total)} UV cycles in the last ${String(days.length)} days, by mode.`}
      height={HEIGHT}
    >
      {(width) => <Plot days={days} width={width} />}
    </ChartBox>
  );
}
