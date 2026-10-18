import type { ReactNode } from 'react';
import { Circle, Path, Text as SvgText } from 'react-native-svg';
import { useColour } from '../../../design/colour';
import { Canvas, useSvgId } from '../parts/frame';
import { BodyGradient, useInk, WELL, type VisualInk } from '../parts/ink';
import { ContactShadow, Shine } from '../parts/material';
import { rounded } from '../parts/shapes';
import type { DetectionFacts, Illumination, VisualProps } from '../types';

const BODY = rounded({ x: 28, y: 10, w: 44, h: 44, r: 12 });
const LENS = rounded({ x: 36, y: 18, w: 28, h: 28, r: 8 });
const RANGES = [48, 62, 76] as const;
const DOTS = [
  { x: 44, y: 70 },
  { x: 56, y: 76 },
  { x: 50, y: 64 },
] as const;
const FAN = 'M50 30L14 92A112 112 0 0 0 86 92Z';
const CLEAR_FAN = 0.1;
const OCCUPIED_FAN = 0.22;

const LIGHT_PATHS: Readonly<Record<Illumination, string>> = {
  dark: 'M5 1a4 4 0 1 0 4 5 3 3 0 0 1-4-5z',
  twilight: 'M1 6a4 4 0 0 1 8 0zM5 0v1M0 3l1 .5M10 3L9 3.5',
  bright: 'M5 2.2a2.8 2.8 0 1 0 .01 0zM5 0v1M5 9v1M0 5h1M9 5h1',
};

function arc(radius: number): string {
  const dx = radius * 0.64;
  const y = 30 + radius * 0.77;
  return `M${String(50 - dx)} ${String(y)}A${String(radius)} ${String(radius)} 0 0 0 ${String(50 + dx)} ${String(y)}`;
}

function Fan({
  ink,
  occupied,
  objects,
  dots,
  overflow,
}: {
  readonly ink: VisualInk;
  readonly occupied: boolean;
  readonly objects: number;
  readonly dots: boolean;
  readonly overflow: boolean;
}): ReactNode {
  const primary = useColour('primary');
  const shown = dots ? DOTS.slice(0, objects) : [];
  return (
    <>
      <Path d={FAN} fill={primary} fillOpacity={occupied ? OCCUPIED_FAN : CLEAR_FAN} />
      {RANGES.map((radius) => (
        <Path key={radius} d={arc(radius)} fill="none" stroke={ink.edge} strokeWidth={1} />
      ))}
      {shown.map((dot) => (
        <Circle
          key={`${String(dot.x)}${String(dot.y)}`}
          cx={dot.x}
          cy={dot.y}
          r={3.6}
          fill={primary}
        />
      ))}
      {overflow && objects > DOTS.length ? (
        <SvgText
          transform={[{ translateX: 62 }, { translateY: 84 }]}
          fontSize={7}
          fontFamily="Geist-Medium"
          fill={ink.ink}
        >
          {`+${String(objects - DOTS.length)}`}
        </SvgText>
      ) : null}
    </>
  );
}

function LightGlyph({
  ink,
  light,
}: {
  readonly ink: VisualInk;
  readonly light: Illumination;
}): ReactNode {
  return (
    <Path
      d={LIGHT_PATHS[light]}
      transform="translate(62 12)"
      stroke={ink.ink}
      strokeWidth={1.3}
      fill="none"
      strokeLinecap="round"
    />
  );
}

function Puck({ ink }: { readonly ink: VisualInk }): ReactNode {
  const body = useSvgId('presence-body');
  return (
    <>
      <BodyGradient id={body} ink={ink} />
      <ContactShadow cx={50} cy={57} rx={24} ry={3.5} />
      <Path d={BODY} fill={`url(#${body})`} stroke={ink.edge} strokeWidth={0.8} />
      <Shine d={BODY} gloss />
      <Path d={LENS} fill={ink.well} fillOpacity={WELL} />
      <Circle
        cx={50}
        cy={32}
        r={6}
        fill={ink.well}
        fillOpacity={WELL}
        stroke={ink.edge}
        strokeWidth={0.8}
      />
    </>
  );
}

const NONE: DetectionFacts = { objects: null, light: null };

export function RadarVisual({ state, size, px }: VisualProps): ReactNode {
  const ink = useInk();
  const { objects, light } = state.detection ?? NONE;
  return (
    <Canvas px={px} layer>
      {state.online ? (
        <Fan
          ink={ink}
          occupied={state.presence === true}
          objects={objects ?? 0}
          dots={size !== 'tile'}
          overflow={size === 'hero'}
        />
      ) : null}
      <Puck ink={ink} />
      {size === 'hero' && state.online && light !== null ? (
        <LightGlyph ink={ink} light={light} />
      ) : null}
    </Canvas>
  );
}
