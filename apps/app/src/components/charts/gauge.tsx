import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useColour, useColourResolver } from '../../design/colour';
import { useMotion } from '../../design/motion';
import { useDraw } from '../use-draw';
import type { ColourRole } from '../../design/tokens';
import { DrawnStroke } from './arc';
import type { DrawnShades } from './draw-shades';
import { arcLength, arcPath } from './geometry';
import {
  GAUGE_START as START,
  GAUGE_SWEEP as SWEEP,
  GaugeMarker,
  GaugeTickMarks,
  type GaugeTicks,
} from './gauge-scale';
import { clamp } from './scale';

const BAND_OPACITY = 0.28;

export interface GaugeBand {
  readonly upTo: number;
  readonly colour: ColourRole;
}

export interface GaugeProps {
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly bands: readonly GaugeBand[];
  readonly size: number;
  readonly label: string;
  readonly thickness?: number;
  readonly ticks?: GaugeTicks;
  readonly marker?: number;
  readonly children?: ReactNode;
}

interface Stroke {
  readonly d: string;
  readonly colour: ColourRole;
  readonly thickness: number;
  readonly opacity: number;
}

function GaugeStroke({ d, colour, thickness, opacity }: Stroke): ReactNode {
  const solid = opacity === 1;
  const stroke = useColour(colour);
  return (
    <Path
      d={d}
      fill="none"
      stroke={stroke}
      strokeOpacity={opacity}
      strokeWidth={thickness}
      strokeLinecap={solid ? 'round' : 'butt'}
    />
  );
}

interface BandArc {
  readonly key: string;
  readonly from: number;
  readonly sweep: number;
  readonly colour: ColourRole;
}

function bandArcs(props: GaugeProps): BandArc[] {
  const { min, max, bands } = props;
  const span = max - min;
  const angleOf = (value: number): number =>
    span === 0 ? 0 : ((clamp(value, { min, max }) - min) / span) * SWEEP;
  return bands.map((band, index) => {
    const from = angleOf(index === 0 ? min : (bands[index - 1]?.upTo ?? min));
    return {
      key: `${band.colour}-${String(band.upTo)}`,
      from: START + from,
      sweep: angleOf(band.upTo) - from,
      colour: band.colour,
    };
  });
}

function shadesOf(
  arcs: readonly BandArc[],
  colour: (role: ColourRole) => string,
): DrawnShades | null {
  const shades = arcs.map((band, index) => ({
    through:
      index === arcs.length - 1
        ? Number.POSITIVE_INFINITY
        : (band.from - START + band.sweep) / SWEEP,
    colour: colour(band.colour),
  }));
  const [first, ...rest] = shades;
  return first === undefined ? null : [first, ...rest];
}

function GaugeArcs(props: GaugeProps & { readonly thickness: number }): ReactNode {
  const { value, min, max, size, thickness } = props;
  const centre = size / 2;
  const radius = (size - thickness) / 2;
  const shown = clamp(value, { min, max });
  const share = max === min ? 0 : (shown - min) / (max - min);
  const drawn = useDraw(share, !useMotion().reduced);
  const ring = { cx: centre, cy: centre, r: radius };
  const full = arcPath(ring, START, START + SWEEP);
  const length = arcLength(radius, SWEEP);
  const frame = { size, thickness, min, max };
  const arcs = bandArcs(props);
  const shades = shadesOf(arcs, useColourResolver());
  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
      {arcs.map((band) =>
        band.sweep > 0 ? (
          <GaugeStroke
            key={band.key}
            d={arcPath(ring, band.from, band.from + band.sweep)}
            colour={band.colour}
            thickness={thickness}
            opacity={BAND_OPACITY}
          />
        ) : null,
      )}
      {shades === null ? null : (
        <DrawnStroke d={full} length={length} shades={shades} thickness={thickness} drawn={drawn} />
      )}
      {props.ticks === undefined ? null : <GaugeTickMarks frame={frame} ticks={props.ticks} />}
      {props.marker === undefined ? null : <GaugeMarker frame={frame} value={props.marker} />}
    </Svg>
  );
}

export function Gauge(props: GaugeProps): ReactNode {
  const { size, label, thickness = Math.round(size / 12), children } = props;
  const box = { width: size, height: size };
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={box}
      className="items-center justify-center"
    >
      <GaugeArcs {...props} thickness={thickness} />
      {children}
    </View>
  );
}
