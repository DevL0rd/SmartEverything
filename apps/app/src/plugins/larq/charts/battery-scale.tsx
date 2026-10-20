import type { ReactNode } from 'react';
import Svg, { Line, Path } from 'react-native-svg';
import { useColour } from '../../../design/colour';
import { rounded } from '../../../features/device-visuals';
import { BATTERY_COLOUR } from '../model/bottle-colours';
import type { BatteryScale } from '../model/care-model';
import { ChartBox } from './chart-box';
import { ChartLabel } from './chart-label';

const HEIGHT = 66;
const LABEL_ROW = 16;
const BAR = 14;
const LABEL_WIDTH = 72;

function Ticks({
  scale,
  width,
}: {
  readonly scale: BatteryScale;
  readonly width: number;
}): ReactNode {
  const warning = useColour('warning');
  const critical = useColour('critical');
  const x = (pct: number): number => (width * pct) / 100;
  return (
    <>
      <Line
        x1={x(scale.alert)}
        x2={x(scale.alert)}
        y1={0}
        y2={BAR + 8 + LABEL_ROW}
        stroke={warning}
        strokeWidth={2}
      />
      <Line
        x1={x(scale.lockout)}
        x2={x(scale.lockout)}
        y1={0}
        y2={BAR + 8}
        stroke={critical}
        strokeWidth={2}
      />
    </>
  );
}

function Plot({
  scale,
  width,
}: {
  readonly scale: BatteryScale;
  readonly width: number;
}): ReactNode {
  const fill = useColour(BATTERY_COLOUR);
  const track = useColour('surface-3');
  const x = (pct: number): number => (width * pct) / 100;
  return (
    <>
      <Svg width={width} height={HEIGHT}>
        <Path d={rounded({ x: 0, y: 4, w: width, h: BAR, r: 7 })} fill={track} />
        {scale.pct === null ? null : (
          <Path
            d={rounded({ x: 0, y: 4, w: Math.max(BAR, x(scale.pct)), h: BAR, r: 7 })}
            fill={fill}
          />
        )}
        <Ticks scale={scale} width={width} />
      </Svg>
      <ChartLabel
        left={Math.min(width - LABEL_WIDTH, x(scale.alert) + 4)}
        top={BAR + 10 + LABEL_ROW}
        width={LABEL_WIDTH}
        text={`alert ${String(scale.alert)}%`}
        tone="variant"
      />
      <ChartLabel
        left={Math.min(width - LABEL_WIDTH, x(scale.lockout) + 4)}
        top={BAR + 10}
        width={LABEL_WIDTH}
        text={`stops ${String(scale.lockout)}%`}
        tone="variant"
      />
    </>
  );
}

export function BatteryScaleBar({ scale }: { readonly scale: BatteryScale }): ReactNode {
  return (
    <ChartBox
      label={`${scale.line}. Low-battery alert at ${String(scale.alert)} percent, cleaning stops at ${String(scale.lockout)} percent.`}
      height={HEIGHT}
    >
      {(width) => <Plot scale={scale} width={width} />}
    </ChartBox>
  );
}
