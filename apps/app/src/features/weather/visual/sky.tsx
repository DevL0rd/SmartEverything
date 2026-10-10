import type { ReactNode } from 'react';
import Svg, { Circle, Defs, Line, Path, RadialGradient, Stop } from 'react-native-svg';
import { GLOW, Layer, SPIN, loopStyle, sway, useSvgId, type Box } from '../../device-visuals';

const LIGHT = '#FFFFFF';
const SHADE = '#000000';

const RAYS = Array.from({ length: 8 }, (_, index) => (index * Math.PI) / 4);

function Halo({
  box,
  px,
  colour,
  moving,
}: {
  readonly box: Box;
  readonly px: number;
  readonly colour: string;
  readonly moving: boolean;
}): ReactNode {
  const halo = useSvgId('halo');
  return (
    <Layer
      box={box}
      px={px}
      motion={loopStyle({ name: GLOW, ms: 3200, alternate: true, easing: 'ease-in-out' }, moving)}
    >
      <Svg width="100%" height="100%" viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id={halo} cx="50" cy="50" r="50" gradientUnits="userSpaceOnUse">
            <Stop offset="0.35" stopColor={colour} stopOpacity={0.45} />
            <Stop offset="1" stopColor={colour} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={50} cy={50} r={50} fill={`url(#${halo})`} />
      </Svg>
    </Layer>
  );
}

export function Sun({
  box,
  px,
  colour,
  moving,
}: {
  readonly box: Box;
  readonly px: number;
  readonly colour: string;
  readonly moving: boolean;
}): ReactNode {
  return (
    <>
      <Halo box={box} px={px} colour={colour} moving={moving} />
      <Layer box={box} px={px} motion={loopStyle({ name: SPIN, ms: 48_000 }, moving)}>
        <Svg width="100%" height="100%" viewBox="0 0 100 100">
          {RAYS.map((angle) => (
            <Line
              key={angle}
              x1={50 + Math.cos(angle) * 31}
              y1={50 + Math.sin(angle) * 31}
              x2={50 + Math.cos(angle) * 41}
              y2={50 + Math.sin(angle) * 41}
              stroke={colour}
              strokeWidth={4.5}
              strokeLinecap="round"
            />
          ))}
        </Svg>
      </Layer>
      <Layer box={box} px={px}>
        <Svg width="100%" height="100%" viewBox="0 0 100 100">
          <Circle cx={50} cy={50} r={23} fill={colour} />
          <Circle cx={43} cy={43} r={9} fill={LIGHT} opacity={0.28} />
        </Svg>
      </Layer>
    </>
  );
}

export function Moon({
  box,
  px,
  colour,
  moving,
}: {
  readonly box: Box;
  readonly px: number;
  readonly colour: string;
  readonly moving: boolean;
}): ReactNode {
  return (
    <Layer
      box={box}
      px={px}
      motion={loopStyle({ name: GLOW, ms: 4200, alternate: true, easing: 'ease-in-out' }, moving)}
    >
      <Svg width="100%" height="100%" viewBox="0 0 100 100">
        <Path d="M62 18 A34 34 0 1 0 84 66 A28 28 0 1 1 62 18 Z" fill={colour} />
        <Circle cx={44} cy={58} r={4} fill={SHADE} opacity={0.08} />
        <Circle cx={36} cy={44} r={2.6} fill={SHADE} opacity={0.08} />
      </Svg>
    </Layer>
  );
}

const CLOUD = 'M16 38 H50 A12 12 0 0 0 51 14.1 A17 17 0 0 0 19 11 A13.5 13.5 0 0 0 16 38 Z';

export function Cloud({
  box,
  px,
  colour,
  shade,
  drift,
  moving,
}: {
  readonly box: Box;
  readonly px: number;
  readonly colour: string;
  readonly shade: string;
  readonly drift: number;
  readonly moving: boolean;
}): ReactNode {
  return (
    <Layer
      box={box}
      px={px}
      motion={loopStyle(
        {
          name: sway((drift * box.w * px) / 100),
          ms: 9000 + drift * 4000,
          alternate: true,
          easing: 'ease-in-out',
        },
        moving,
      )}
    >
      <Svg width="100%" height="100%" viewBox="0 0 64 40">
        <Path d={CLOUD} fill={colour} />
        <Path
          d="M16 38 H50 A12 12 0 0 0 58 34 H12 A13 13 0 0 0 16 38 Z"
          fill={shade}
          opacity={0.35}
        />
      </Svg>
    </Layer>
  );
}
