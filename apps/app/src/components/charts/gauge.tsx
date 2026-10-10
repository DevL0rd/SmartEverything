import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useColour } from '../../design/colour';
import { useMotion } from '../../design/motion';
import { useTween } from '../use-tween';
import type { ColourRole } from '../../design/tokens';
import { arcPath } from './arc';
import { clamp } from './scale';

const START = -135;
const SWEEP = 270;
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

class GaugeBandsError extends Error {
  override readonly name = 'GaugeBandsError';

  constructor(readonly value: number) {
    super(`No gauge band covers ${String(value)}; the last band's upTo must reach max.`);
  }
}

function bandOf(bands: readonly GaugeBand[], value: number): GaugeBand {
  const band = bands.find((candidate) => value <= candidate.upTo);
  if (band === undefined) {
    throw new GaugeBandsError(value);
  }
  return band;
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

function GaugeArcs(props: GaugeProps & { readonly thickness: number }): ReactNode {
  const { value, min, max, bands, size, thickness } = props;
  const centre = size / 2;
  const radius = (size - thickness) / 2;
  const shown = useTween(clamp(value, { min, max }), !useMotion().reduced);
  const share = max === min ? 0 : (shown - min) / (max - min);
  return (
    <View pointerEvents="none" className="absolute inset-0">
      <Svg width={size} height={size}>
        {bandArcs(props).map((band) =>
          band.sweep > 0 ? (
            <GaugeStroke
              key={band.key}
              d={arcPath(centre, radius, band.from, band.sweep)}
              colour={band.colour}
              thickness={thickness}
              opacity={BAND_OPACITY}
            />
          ) : null,
        )}
        {share > 0 ? (
          <GaugeStroke
            d={arcPath(centre, radius, START, SWEEP * share)}
            colour={bandOf(bands, shown).colour}
            thickness={thickness}
            opacity={1}
          />
        ) : null}
      </Svg>
    </View>
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
