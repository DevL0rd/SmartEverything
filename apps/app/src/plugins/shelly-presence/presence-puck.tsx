import type { ReactNode } from 'react';
import Svg, { Circle, Ellipse, G, Path, Text as SvgText } from 'react-native-svg';
import type { ShellyDevice } from '@smarteverything/shelly';
import { useColour } from '../../design/colour';
import { rounded } from '../../features/device-visuals';

type LightStatus = NonNullable<ShellyDevice['light'][number]['status']>;
type Illumination = NonNullable<LightStatus['illumination']>;

const LIGHT_PATHS: Readonly<Record<string, string>> = {
  dark: 'M5 1a4 4 0 1 0 4 5 3 3 0 0 1-4-5z',
  twilight: 'M1 6a4 4 0 0 1 8 0zM5 0v1M0 3l1 .5M10 3L9 3.5',
  bright: 'M5 2.2a2.8 2.8 0 1 0 .01 0zM5 0v1M5 9v1M0 5h1M9 5h1',
};

export interface PresencePuckProps {
  readonly size: number;
  readonly occupied: boolean;
  readonly count: number;
  readonly light: Illumination | null;
  readonly offline: boolean;
}

const BODY = rounded({ x: 28, y: 10, w: 44, h: 44, r: 12 });
const LENS = rounded({ x: 36, y: 18, w: 28, h: 28, r: 8 });
const RANGES = [48, 62, 76] as const;
const DOTS = [
  { x: 44, y: 70 },
  { x: 56, y: 76 },
  { x: 50, y: 64 },
] as const;
const DOT_SIZE = 96;
const HERO_SIZE = 200;

function arc(radius: number): string {
  const dx = radius * 0.64;
  const y = 38 + radius * 0.77;
  return `M${String(50 - dx)} ${String(y)}A${String(radius)} ${String(radius)} 0 0 0 ${String(50 + dx)} ${String(y)}`;
}

function LightGlyph({ light }: { readonly light: Illumination }): ReactNode {
  const ink = useColour('on-surface-variant');
  const path = LIGHT_PATHS[light];
  if (path === undefined) return null;
  return (
    <G
      transform={[{ translateX: 62 }, { translateY: 12 }]}
      stroke={ink}
      strokeWidth={1.3}
      fill="none"
      strokeLinecap="round"
    >
      <Path d={path} />
    </G>
  );
}

function Fan({
  occupied,
  count,
  size,
}: Pick<PresencePuckProps, 'occupied' | 'count' | 'size'>): ReactNode {
  const primary = useColour('primary');
  const edge = useColour('outline');
  const variant = useColour('on-surface-variant');
  return (
    <G>
      <Path d="M50 30L14 92A112 112 0 0 0 86 92Z" fill={primary} opacity={occupied ? 0.22 : 0.1} />
      {RANGES.map((radius) => (
        <Path
          key={radius}
          d={arc(radius)}
          fill="none"
          stroke={edge}
          strokeWidth={1}
          transform={[{ translateY: -8 }]}
        />
      ))}
      {size >= DOT_SIZE
        ? DOTS.slice(0, Math.min(DOTS.length, count)).map((dot) => (
            <Circle
              key={`${String(dot.x)}${String(dot.y)}`}
              cx={dot.x}
              cy={dot.y}
              r={3.6}
              fill={primary}
            />
          ))
        : null}
      {size >= HERO_SIZE && count > DOTS.length ? (
        <SvgText transform={[{ translateX: 62 }, { translateY: 84 }]} fontSize={7} fill={variant}>
          {`+${String(count - DOTS.length)}`}
        </SvgText>
      ) : null}
    </G>
  );
}

export function PresencePuck({
  size,
  occupied,
  count,
  light,
  offline,
}: PresencePuckProps): ReactNode {
  const body = useColour('surface-3');
  const edge = useColour('outline');
  const lens = useColour('bg');
  const ink = useColour('on-surface');
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      opacity={offline ? 0.6 : 1}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {offline ? null : <Fan occupied={occupied} count={count} size={size} />}
      <Ellipse cx={50} cy={36} rx={22} ry={3} fill={ink} opacity={0.08} />
      <Path d={BODY} fill={body} stroke={edge} strokeWidth={1.2} />
      <Path d={LENS} fill={lens} />
      <Circle cx={50} cy={32} r={6} fill={lens} stroke={edge} strokeWidth={1} />
      <Path
        d="M32 14c6-2 12-2 18-2"
        stroke={ink}
        strokeWidth={1}
        opacity={0.14}
        fill="none"
        strokeLinecap="round"
      />
      {size >= HERO_SIZE && !offline && light !== null ? <LightGlyph light={light} /> : null}
    </Svg>
  );
}
