import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { useColour } from '../../design/colour';
import type { ChartSeries, Model } from './chart-model';
import { Crosshair, Grid } from './chart-parts';
import type { ChartPoint, Drawn, Hit } from './scale';

const END_DOT = 4;

function EndDot({
  model,
  drawn,
  focus,
  ring,
}: {
  readonly model: Model;
  readonly drawn: Drawn<ChartSeries>;
  readonly focus: ChartPoint | null;
  readonly ring: string;
}): ReactNode {
  const fill = useColour(drawn.series.colour);
  const last = drawn.points[drawn.points.length - 1];
  return (
    <>
      {last === undefined ? null : (
        <Circle
          cx={model.box.right}
          cy={model.y(last.v)}
          r={END_DOT}
          fill={fill}
          stroke={ring}
          strokeWidth={2}
        />
      )}
      {focus === null ? null : (
        <Circle
          cx={model.x(focus.t)}
          cy={model.y(focus.v)}
          r={END_DOT}
          fill={fill}
          stroke={ring}
          strokeWidth={2}
        />
      )}
    </>
  );
}

function NowRule({ model }: { readonly model: Model }): ReactNode {
  const stroke = useColour('on-surface-variant');
  return (
    <Line
      x1={model.box.right}
      x2={model.box.right}
      y1={model.box.top}
      y2={model.box.bottom}
      stroke={stroke}
      strokeDasharray="4 3"
    />
  );
}

export function Overlay({
  model,
  hits,
  nowRule,
  bare,
}: {
  readonly model: Model;
  readonly hits: readonly Hit<ChartSeries>[];
  readonly nowRule: boolean;
  readonly bare: boolean;
}): ReactNode {
  const ring = useColour('surface-1');
  return (
    <View pointerEvents="none" className="absolute inset-0">
      <Svg width={model.box.width} height={model.box.height}>
        {bare ? null : <Grid model={model} />}
        {nowRule ? <NowRule model={model} /> : null}
        {hits.length > 0 ? <Crosshair hits={hits} model={model} /> : null}
        {bare
          ? null
          : model.drawn.map((drawn) => (
              <EndDot
                key={drawn.series.label}
                model={model}
                drawn={drawn}
                ring={ring}
                focus={hits.find((hit) => hit.series === drawn.series)?.point ?? null}
              />
            ))}
      </Svg>
    </View>
  );
}
