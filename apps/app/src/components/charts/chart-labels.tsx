import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Line } from 'react-native-svg';
import { useColour } from '../../design/colour';
import { withUnit } from '../../format/number';
import { Text } from '../text';
import { AXIS_W, LABEL_W, X_AXIS_H, type Model } from './chart-model';
import { clamp, extremaOf } from './scale';

function AxisLabel({
  left,
  top,
  text,
  align,
}: {
  readonly left: number;
  readonly top: number;
  readonly text: string;
  readonly align: 'center' | 'end';
}): ReactNode {
  const place = { left, top, width: align === 'end' ? AXIS_W - 6 : LABEL_W };
  return (
    <View pointerEvents="none" style={place} className="absolute">
      <Text variant="caption" tone="faint" align={align} numberOfLines={1} className="tabular">
        {text}
      </Text>
    </View>
  );
}

function centred(model: Model, x: number): number {
  return clamp(x - LABEL_W / 2, { min: 0, max: model.box.width - LABEL_W });
}

export function Axes({ model }: { readonly model: Model }): ReactNode {
  return (
    <>
      {model.yTicks.map((tick) => (
        <AxisLabel
          key={`y-${String(tick)}`}
          left={0}
          top={model.y(tick) - 8}
          align="end"
          text={model.format(tick)}
        />
      ))}
      {model.xTicks.map((tick) => (
        <AxisLabel
          key={`x-${String(tick.at)}`}
          left={centred(model, model.x(tick.at))}
          top={model.box.height - X_AXIS_H + 2}
          align="center"
          text={tick.label}
        />
      ))}
    </>
  );
}

export function Extremes({ model }: { readonly model: Model }): ReactNode {
  const extrema = extremaOf(model.drawn[0]?.points ?? []);
  if (extrema === null || extrema.peak.v === extrema.low.v) {
    return null;
  }
  const { peak, low } = extrema;
  return (
    <>
      <AxisLabel
        left={centred(model, model.x(peak.t))}
        top={model.y(peak.v) - 18}
        align="center"
        text={withUnit(model.format(peak.v), model.unit)}
      />
      <AxisLabel
        left={centred(model, model.x(low.t))}
        top={model.y(low.v) + 4}
        align="center"
        text={withUnit(model.format(low.v), model.unit)}
      />
    </>
  );
}

function markerX(model: Model): number | null {
  const { marker } = model;
  if (marker === null) {
    return null;
  }
  const x = model.x(marker.at);
  return x < model.box.left || x > model.box.right ? null : x;
}

export function MarkerLine({ model }: { readonly model: Model }): ReactNode {
  const stroke = useColour('primary');
  const x = markerX(model);
  return x === null ? null : (
    <Line
      x1={x}
      x2={x}
      y1={model.box.top}
      y2={model.box.bottom}
      stroke={stroke}
      strokeWidth={1.5}
      strokeDasharray="4 4"
    />
  );
}

export function MarkerLabel({ model }: { readonly model: Model }): ReactNode {
  const x = markerX(model);
  return x === null || model.marker === null ? null : (
    <AxisLabel left={centred(model, x)} top={0} align="center" text={model.marker.label} />
  );
}
